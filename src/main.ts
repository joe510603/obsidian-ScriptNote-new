/**
 * ScriptNote - 短剧剧本写作插件 - 主入口
 * 负责插件生命周期管理和各模块初始化
 */

import { Plugin, Notice, MarkdownView, TFile, Editor } from 'obsidian';
import { GlobalSettings } from './types';
import { EventBus } from './services/EventBus';
import { StateManager } from './services/StateManager';
import { SceneService } from './services/SceneService';
import { ProjectService } from './services/ProjectService';
import { StatsService } from './services/StatsService';
import { ExportService } from './services/ExportService';
import { AIService } from './services/AIService';
import { SidePanelView } from './ui/SidePanelView';
import { ScreenplaySettingTab } from './ui/SettingsTab';
import { DEFAULT_TIME_PRESETS, DEFAULT_TAG_PRESETS, DEFAULT_LOCATION_PRESETS, SIDE_PANEL_VIEW_TYPE } from './utils/constants';
import { createSmartEnterExtension, createCharacterPopupExtension, createSceneHeaderValidationExtension, createAtCharacterExtension, createTabModifierExtension, setModifierHotkey } from './extensions';
import { WordExporter, PDFExporter, BreakdownExporter } from './exporters';

/**
 * 默认导出格式设置
 */
const DEFAULT_EXPORT_FORMAT = {
    episodeTitle: {
        font: 'SimHei',     // 黑体
        size: 16,           // 16pt
        bold: true,
        center: true
    },
    sceneHeader: {
        font: 'SimHei',     // 黑体
        size: 12,           // 12pt
        bold: true
    },
    body: {
        font: 'SimSun',     // 宋体
        size: 12            // 12pt
    },
    characterName: {
        font: 'SimSun',     // 宋体
        size: 12,           // 12pt
        bold: true
    },
    action: {
        font: 'KaiTi',      // 楷体
        size: 12            // 12pt
    }
};

/**
 * 默认全局设置
 */
const DEFAULT_SETTINGS: GlobalSettings = {
    screenplayProjects: [],
    autoInsertTriangle: true,
    enableCharacterPopup: true,
    modifierHotkey: {
        key: 'Tab',
        altKey: true,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false
    },
    defaultTimePresets: DEFAULT_TIME_PRESETS,
    defaultTagPresets: DEFAULT_TAG_PRESETS,
    defaultLocationPresets: DEFAULT_LOCATION_PRESETS,
    aiApiKey: '',
    aiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    aiModel: 'deepseek-chat',
    defaultExportTemplate: 'standard',
    wordExportFont: 'SimSun',
    pdfExportFont: 'SimSun',
    exportIncludeSettings: true,
    breakdownIncludeDuration: true,
    exportFormat: DEFAULT_EXPORT_FORMAT,
    panelOpen: false
};

/**
 * ScriptNote - 短剧剧本写作插件主类
 */
export default class ScreenplayPlugin extends Plugin {
    /** 全局设置 */
    globalSettings: GlobalSettings = DEFAULT_SETTINGS;

    /** 事件总线 */
    eventBus: EventBus = new EventBus();

    /** 状态管理器 */
    stateManager: StateManager = new StateManager(this.eventBus);

    /** 场景服务 */
    sceneService: SceneService = new SceneService(this.eventBus);

    /** 项目设定服务 */
    projectService!: ProjectService;

    /** 统计服务 */
    statsService: StatsService = new StatsService();

    /** 导出服务 */
    exportService: ExportService = new ExportService();

    /** AI 辅助服务 */
    aiService: AIService = new AIService();

    /** 编辑器变化防抖定时器 */
    private editorChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * 插件加载时调用
     */
    async onload(): Promise<void> {
        console.log('ScriptNote 插件加载中...');

        // 加载设置
        await this.loadSettings();

        // 配置 AI 服务
        this.aiService.configure({
            apiKey: this.globalSettings.aiApiKey,
            endpoint: this.globalSettings.aiEndpoint,
            model: this.globalSettings.aiModel
        });

        // 初始化项目设定服务
        this.projectService = new ProjectService(this.app, this.eventBus, this.stateManager);

        // 注册导出器
        this.registerExporters();

        // 注册侧边面板视图
        this.registerView(
            SIDE_PANEL_VIEW_TYPE,
            (leaf) => new SidePanelView(leaf, this)
        );

        // 注册 ribbon 图标
        this.addRibbonIcon('film', 'ScriptNote', () => {
            this.toggleSidePanel();
        });

        // 注册快捷键命令（不使用命令面板，仅支持快捷键绑定）
        this.registerHotkeys();

        // 注册设置页面
        this.addSettingTab(new ScreenplaySettingTab(this.app, this));

        // 注册 CodeMirror 编辑器扩展
        this.registerEditorExtensions();

        // 注册文件切换事件监听
        this.registerEvent(
            this.app.workspace.on('file-open', (file: TFile | null) => {
                this.handleFileOpen(file);
            })
        );

        // 注册编辑器变化事件监听（用于实时更新统计）
        this.registerEvent(
            this.app.workspace.on('editor-change', () => {
                this.handleEditorChange();
            })
        );

        // 如果之前面板是打开状态，恢复面板
        if (this.globalSettings.panelOpen) {
            // 等待布局准备就绪后再打开面板
            this.app.workspace.onLayoutReady(() => {
                this.activateSidePanel();
            });
        }

        // 布局准备就绪后，加载当前文件的设定
        this.app.workspace.onLayoutReady(() => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                this.handleFileOpen(activeFile);
            }
        });

        console.log('ScriptNote 插件加载完成');
    }

    /**
     * 插件卸载时调用
     */
    async onunload(): Promise<void> {
        // 清理编辑器变化防抖定时器
        if (this.editorChangeDebounceTimer) {
            clearTimeout(this.editorChangeDebounceTimer);
        }

        // 清理事件总线
        this.eventBus.clear();

        // 清理状态管理器监听器
        this.stateManager.clearListeners();

        // 清理项目服务缓存
        this.projectService.clearCache();

        // 清理统计服务缓存
        this.statsService.invalidateCache();

        // 清理导出服务
        this.exportService.clearExporters();

        // 关闭所有面板视图
        this.app.workspace.detachLeavesOfType(SIDE_PANEL_VIEW_TYPE);

        console.log('ScriptNote 插件已卸载');
    }

    /**
     * 加载设置
     */
    async loadSettings(): Promise<void> {
        const data = await this.loadData();
        this.globalSettings = Object.assign({}, DEFAULT_SETTINGS, data);
        
        // 同步修饰符快捷键配置
        if (this.globalSettings.modifierHotkey) {
            setModifierHotkey(this.globalSettings.modifierHotkey);
        }
    }

    /**
     * 保存设置
     */
    async saveSettings(): Promise<void> {
        await this.saveData(this.globalSettings);
        
        // 同步修饰符快捷键配置
        if (this.globalSettings.modifierHotkey) {
            setModifierHotkey(this.globalSettings.modifierHotkey);
        }
    }

    /**
     * 处理编辑器内容变化事件
     * 使用防抖机制避免频繁更新
     */
    private handleEditorChange(): void {
        // 清除之前的定时器
        if (this.editorChangeDebounceTimer) {
            clearTimeout(this.editorChangeDebounceTimer);
        }

        // 设置新的定时器，延迟 500ms 后更新
        this.editorChangeDebounceTimer = setTimeout(() => {
            // 通知状态管理器文档已变化
            const view = this.getActiveMarkdownView();
            if (view) {
                const content = view.editor.getValue();
                this.stateManager.onDocumentChange(content);
            }
        }, 500);
    }

    /**
     * 处理文件打开事件
     * 当用户切换到不同文件时，自动加载对应的项目设定
     * @param file 打开的文件
     */
    private async handleFileOpen(file: TFile | null): Promise<void> {
        // 如果没有文件参数，尝试获取当前活动文件
        // 这样可以避免在点击侧边面板时错误地清除项目状态
        if (!file) {
            file = this.app.workspace.getActiveFile();
        }
        
        if (!file) {
            // 真的没有打开的文件，但不要清除项目状态
            // 因为用户可能只是点击了侧边面板
            return;
        }

        // 只处理 Markdown 文件
        if (file.extension !== 'md') {
            return;
        }

        // 切换到新文件的设定
        await this.projectService.switchFile(file.path);
    }

    /**
     * 注册快捷键命令
     * 注意：不使用命令面板，仅支持快捷键绑定
     */
    private registerHotkeys(): void {
        // 插入场景命令
        this.addCommand({
            id: 'insert-scene',
            name: '插入场景',
            callback: () => {
                this.handleInsertScene();
            }
        });

        // 新建一集命令
        this.addCommand({
            id: 'new-episode',
            name: '新建一集',
            callback: () => {
                this.handleNewEpisode();
            }
        });

        // 插入闪回命令
        this.addCommand({
            id: 'insert-flashback',
            name: '插入闪回',
            callback: () => {
                this.handleInsertFlashback();
            }
        });

        // 结束闪回命令
        this.addCommand({
            id: 'end-flashback',
            name: '结束闪回',
            callback: () => {
                this.handleEndFlashback();
            }
        });

        // 插入动作描述命令
        this.addCommand({
            id: 'insert-action',
            name: '插入动作描述 △',
            callback: () => {
                this.handleInsertAction();
            }
        });

        // 插入旁白（OS）命令
        this.addCommand({
            id: 'insert-os',
            name: '插入旁白（OS）',
            callback: () => {
                this.handleInsertNarration('os');
            }
        });

        // 插入【旁白】命令
        this.addCommand({
            id: 'insert-narrator',
            name: '插入【旁白】',
            callback: () => {
                this.handleInsertNarration('narrator');
            }
        });

        // 插入内心独白（VO）命令
        this.addCommand({
            id: 'insert-vo',
            name: '插入内心独白（VO）',
            callback: () => {
                this.handleInsertNarration('vo');
            }
        });
    }

    /**
     * 注册 CodeMirror 编辑器扩展
     * 包括角色选择弹窗、场景头验证高亮等功能
     * 所有扩展只在剧本文件中生效
     */
    private registerEditorExtensions(): void {
        // 智能回车扩展（回车后自动插入 △ 功能，可在设置中开关）
        const smartEnterExtension = createSmartEnterExtension(
            () => this.globalSettings.autoInsertTriangle && this.isCurrentFileScreenplay()
        );
        this.registerEditorExtension(smartEnterExtension);
        
        // 注册角色选择弹窗扩展（/ 触发，只在剧本文件中生效）
        const characterPopupExtension = createCharacterPopupExtension(
            () => this.globalSettings.enableCharacterPopup && this.isCurrentFileScreenplay(),
            () => this.projectService.getCharacters()
        );
        this.registerEditorExtension(characterPopupExtension);

        // 注册场景头格式验证高亮扩展（只在剧本文件中生效）
        const sceneHeaderValidationExtension = createSceneHeaderValidationExtension(
            () => this.isCurrentFileScreenplay()
        );
        this.registerEditorExtension(sceneHeaderValidationExtension);

        // 注册 @ 人物选择扩展（只在剧本文件中生效）
        const atCharacterExtension = createAtCharacterExtension(
            () => this.isCurrentFileScreenplay(),
            () => this.extractCharactersFromDocument()
        );
        this.registerEditorExtension(atCharacterExtension);

        // 注册 Tab 修饰符选择扩展（只在剧本文件中生效）
        const tabModifierExtension = createTabModifierExtension(
            () => this.isCurrentFileScreenplay()
        );
        this.registerEditorExtension(tabModifierExtension);
    }

    /**
     * 从当前文档提取人物列表
     * 从 "人物：xxx、xxx" 行中提取人物名
     * @returns 人物名数组（去重）
     */
    extractCharactersFromDocument(): string[] {
        const view = this.getActiveMarkdownView();
        if (!view) return [];

        const content = view.editor.getValue();
        const characters = new Set<string>();

        // 匹配 "人物：xxx、xxx" 或 "人物:xxx、xxx" 格式
        const lines = content.split('\n');
        for (const line of lines) {
            const match = line.match(/^人物[：:]\s*(.+)$/);
            if (match) {
                // 分割人物名（支持顿号、逗号分隔）
                const names = match[1].split(/[、，,]/);
                for (const name of names) {
                    const trimmed = name.trim();
                    if (trimmed) {
                        characters.add(trimmed);
                    }
                }
            }
        }

        return Array.from(characters);
    }

    /**
     * 切换侧边面板显示状态
     */
    async toggleSidePanel(): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType(SIDE_PANEL_VIEW_TYPE);

        if (leaves.length > 0) {
            // 面板已存在，关闭它
            await this.closeSidePanel();
        } else {
            // 面板不存在，打开它
            await this.activateSidePanel();
        }
    }

    /**
     * 激活（打开）侧边面板
     */
    async activateSidePanel(): Promise<void> {
        const { workspace } = this.app;

        // 检查是否已存在面板
        let leaf = workspace.getLeavesOfType(SIDE_PANEL_VIEW_TYPE)[0];

        if (!leaf) {
            // 在右侧边栏创建新的叶子节点
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                leaf = rightLeaf;
                await leaf.setViewState({
                    type: SIDE_PANEL_VIEW_TYPE,
                    active: true
                });
            }
        }

        // 显示面板
        if (leaf) {
            workspace.revealLeaf(leaf);
        }

        // 更新状态
        this.globalSettings.panelOpen = true;
        this.stateManager.setUIState({ panelOpen: true });
        await this.saveSettings();
    }

    /**
     * 关闭侧边面板
     */
    async closeSidePanel(): Promise<void> {
        // 关闭所有该类型的面板
        this.app.workspace.detachLeavesOfType(SIDE_PANEL_VIEW_TYPE);

        // 更新状态
        this.globalSettings.panelOpen = false;
        this.stateManager.setUIState({ panelOpen: false });
        await this.saveSettings();
    }

    /**
     * 检查指定文件是否为剧本文件
     * 规则：必须在已注册的剧本项目文件夹内，且有 type: screenplay 标签
     * @param filePath 文件路径
     * @param content 文件内容（可选，如果不提供则只检查路径）
     * @returns 是否为剧本文件
     */
    isScreenplayFile(filePath: string, content?: string): boolean {
        const projects = this.globalSettings.screenplayProjects || [];
        
        // 如果没有配置任何项目，返回 false
        if (projects.length === 0) {
            return false;
        }
        
        // 检查是否在任一剧本项目文件夹内
        const normalizedPath = filePath.replace(/\\/g, '/');
        let inProject = false;
        
        for (const project of projects) {
            const normalizedProject = project.replace(/\\/g, '/');
            if (normalizedPath.startsWith(normalizedProject + '/') || normalizedPath === normalizedProject) {
                inProject = true;
                break;
            }
        }
        
        if (!inProject) {
            return false;
        }
        
        // 如果提供了内容，检查是否有 type: screenplay 标签
        if (content !== undefined) {
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (frontmatterMatch) {
                const frontmatter = frontmatterMatch[1];
                return /^type:\s*screenplay\s*$/m.test(frontmatter);
            }
            return false;
        }
        
        // 如果没有提供内容，只检查路径
        return true;
    }

    /**
     * 检查当前活动文件是否为剧本文件
     * @returns 是否为剧本文件
     */
    isCurrentFileScreenplay(): boolean {
        // 只使用当前活动的编辑器，不要回退到其他打开的文件
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) {
            // 尝试从活动文件获取
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile || activeFile.extension !== 'md') {
                return false;
            }
            
            // 从活动文件找到对应的视图
            const leaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of leaves) {
                const leafView = leaf.view;
                if (leafView instanceof MarkdownView && leafView.file?.path === activeFile.path) {
                    const content = leafView.editor.getValue();
                    return this.isScreenplayFile(activeFile.path, content);
                }
            }
            return false;
        }
        
        const content = view.editor.getValue();
        const result = this.isScreenplayFile(view.file.path, content);
        
        return result;
    }

    /**
     * 获取当前活动的编辑器
     * 优先从活动视图获取，如果失败则尝试从任意打开的 Markdown 视图获取
     * @returns 编辑器实例，如果没有活动编辑器返回 null
     */
    private getActiveEditor() {
        // 方法1：直接从活动视图获取
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            return view.editor;
        }

        // 方法2：从活动文件获取对应的编辑器
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === 'md') {
            // 遍历所有叶子节点，找到打开该文件的 MarkdownView
            const leaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of leaves) {
                const leafView = leaf.view;
                if (leafView instanceof MarkdownView && leafView.file?.path === activeFile.path) {
                    return leafView.editor;
                }
            }
        }

        // 不再回退到任意打开的 Markdown 编辑器
        // 这样可以确保只处理真正活动的文件
        return null;
    }

    /**
     * 获取当前活动的 MarkdownView
     * 注意：只返回真正活动的视图，不会回退到其他打开的文件
     * @returns MarkdownView 实例，如果没有返回 null
     */
    private getActiveMarkdownView(): MarkdownView | null {
        // 方法1：直接从活动视图获取
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            return view;
        }

        // 方法2：从活动文件获取对应的视图
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === 'md') {
            const leaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of leaves) {
                const leafView = leaf.view;
                if (leafView instanceof MarkdownView && leafView.file?.path === activeFile.path) {
                    return leafView;
                }
            }
        }

        // 不再回退到任意打开的 Markdown 视图
        // 这样可以确保只处理真正活动的文件
        return null;
    }

    /**
     * 更新场景索引
     * 解析当前文档内容并更新场景服务的索引
     */
    private updateSceneIndex(): void {
        const view = this.getActiveMarkdownView();
        if (!view) {
            return;
        }
        const content = view.editor.getValue();
        this.sceneService.parseDocument(content);
    }

    /**
     * 处理插入场景操作
     * 直接插入场景头（格式：X-X 日 内 地点 + 人物：）
     */
    handleInsertScene(): void {
        const editor = this.getActiveEditor();
        if (!editor) {
            new Notice('请先打开一个 Markdown 文件');
            return;
        }

        // 更新场景索引
        this.updateSceneIndex();

        // 直接插入场景（使用默认值：日、内、地点）
        this.sceneService.insertScene(editor, undefined, '日', '内', '地点');
        
        new Notice('已插入新场景');
    }

    /**
     * 显示场景插入对话框
     * 包含时间和地点下拉选择
     * @param editor 编辑器实例
     */
    private showSceneInsertDialog(editor: Editor): void {
        // 获取预设列表
        const timePresets = this.getTimePresets();
        const locationPresets = this.getLocationPresets();

        // 创建模态对话框
        const overlay = document.createElement('div');
        overlay.className = 'screenplay-modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'screenplay-modal screenplay-scene-insert-modal';
        
        // 标题
        const headerEl = modal.createDiv({ cls: 'screenplay-modal-header' });
        headerEl.createEl('h3', { text: '插入场景' });
        
        const closeBtn = headerEl.createEl('button', { cls: 'screenplay-modal-close' });
        closeBtn.innerHTML = '×';
        closeBtn.addEventListener('click', () => overlay.remove());
        
        // 表单内容
        const formEl = modal.createDiv({ cls: 'screenplay-modal-body' });
        
        // 时间选择
        const timeField = formEl.createDiv({ cls: 'screenplay-field' });
        timeField.createEl('label', { text: '时间', cls: 'screenplay-label' });
        
        const timeContainer = timeField.createDiv({ cls: 'screenplay-select-container' });
        const timeSelect = timeContainer.createEl('select', { cls: 'screenplay-select' });
        
        for (const preset of timePresets) {
            const option = timeSelect.createEl('option', { value: preset, text: preset });
            if (preset === '日') {
                option.selected = true;
            }
        }
        
        // 自定义时间输入
        const timeCustomInput = timeContainer.createEl('input', {
            type: 'text',
            cls: 'screenplay-input screenplay-custom-input',
            placeholder: '或输入自定义时间'
        });
        
        // 内外景选择
        const locationTypeField = formEl.createDiv({ cls: 'screenplay-field' });
        locationTypeField.createEl('label', { text: '内外景', cls: 'screenplay-label' });
        
        const locationTypeContainer = locationTypeField.createDiv({ cls: 'screenplay-radio-group' });
        
        const innerRadio = locationTypeContainer.createEl('label', { cls: 'screenplay-radio-label' });
        const innerInput = innerRadio.createEl('input', { type: 'radio', attr: { name: 'locationType', value: '内' } });
        innerInput.checked = true;
        innerRadio.createSpan({ text: '内' });
        
        const outerRadio = locationTypeContainer.createEl('label', { cls: 'screenplay-radio-label' });
        locationTypeContainer.createEl('input', { type: 'radio', attr: { name: 'locationType', value: '外' } });
        outerRadio.createSpan({ text: '外' });
        
        // 地点选择
        const locationField = formEl.createDiv({ cls: 'screenplay-field' });
        locationField.createEl('label', { text: '地点', cls: 'screenplay-label' });
        
        const locationContainer = locationField.createDiv({ cls: 'screenplay-select-container' });
        const locationSelect = locationContainer.createEl('select', { cls: 'screenplay-select' });
        
        // 添加空选项
        locationSelect.createEl('option', { value: '', text: '-- 选择地点 --' });
        
        // 添加最近使用的地点（如果有）
        const projectSettings = this.projectService.getCurrentSettings();
        const recentLocations = projectSettings?.recentLocations || [];
        
        if (recentLocations.length > 0) {
            const recentGroup = locationSelect.createEl('optgroup', { attr: { label: '最近使用' } });
            for (const location of recentLocations) {
                recentGroup.createEl('option', { value: location, text: location });
            }
        }
        
        // 添加预设地点（排除最近使用的）
        const otherPresets = locationPresets.filter(p => !recentLocations.includes(p));
        if (otherPresets.length > 0) {
            const presetGroup = locationSelect.createEl('optgroup', { attr: { label: '预设地点' } });
            for (const preset of otherPresets) {
                presetGroup.createEl('option', { value: preset, text: preset });
            }
        }
        
        // 自定义地点输入
        const locationCustomInput = locationContainer.createEl('input', {
            type: 'text',
            cls: 'screenplay-input screenplay-custom-input',
            placeholder: '或输入自定义地点'
        });
        
        // 按钮区域
        const footerEl = modal.createDiv({ cls: 'screenplay-modal-footer' });
        
        const cancelBtn = footerEl.createEl('button', {
            cls: 'screenplay-btn',
            text: '取消'
        });
        cancelBtn.addEventListener('click', () => overlay.remove());
        
        const insertBtn = footerEl.createEl('button', {
            cls: 'screenplay-btn screenplay-btn-primary',
            text: '插入'
        });
        insertBtn.addEventListener('click', async () => {
            // 获取选择的值
            const time = timeCustomInput.value.trim() || timeSelect.value;
            const locationType = innerInput.checked ? '内' : '外';
            const location = locationCustomInput.value.trim() || locationSelect.value || '地点';
            
            if (!time) {
                new Notice('请选择或输入时间');
                return;
            }
            
            // 插入场景
            this.sceneService.insertScene(editor, undefined, time, locationType, location);
            
            // 如果使用了自定义地点，添加到最近使用
            if (locationCustomInput.value.trim() || locationSelect.value) {
                const usedLocation = locationCustomInput.value.trim() || locationSelect.value;
                await this.addRecentLocation(usedLocation);
            }
            
            overlay.remove();
            new Notice('已插入新场景');
        });
        
        overlay.appendChild(modal);
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
        
        document.body.appendChild(overlay);
        
        // 聚焦到地点输入框
        setTimeout(() => locationCustomInput.focus(), 100);
    }

    /**
     * 处理新建一集操作
     */
    handleNewEpisode(): void {
        const editor = this.getActiveEditor();
        if (!editor) {
            new Notice('请先打开一个 Markdown 文件');
            return;
        }

        // 更新场景索引
        this.updateSceneIndex();

        // 插入新一集
        this.sceneService.insertNewEpisode(editor);
        
        new Notice('已新建一集');
    }

    /**
     * 处理插入闪回操作
     * 直接插入【闪回】标记、新场景和【闪回结束】标记
     */
    handleInsertFlashback(): void {
        const editor = this.getActiveEditor();
        if (!editor) {
            new Notice('请先打开一个 Markdown 文件');
            return;
        }

        // 更新场景索引
        this.updateSceneIndex();

        // 插入闪回（包含开始和结束标记）
        this.sceneService.insertFlashbackWithEnd(editor);
        
        new Notice('已插入闪回');
    }

    /**
     * 处理结束闪回操作
     * 插入【闪回结束】标记
     */
    handleEndFlashback(): void {
        const editor = this.getActiveEditor();
        if (!editor) {
            new Notice('请先打开一个 Markdown 文件');
            return;
        }

        // 插入闪回结束标记
        this.sceneService.insertFlashbackEnd(editor);
        
        new Notice('已结束闪回');
    }

    /**
     * 处理插入闪回操作（同时插入开始和结束标记）
     * 插入【闪回】标记、新场景和【闪回结束】标记
     */
    handleInsertFlashbackWithEnd(): void {
        const editor = this.getActiveEditor();
        if (!editor) {
            new Notice('请先打开一个 Markdown 文件');
            return;
        }

        // 更新场景索引
        this.updateSceneIndex();

        // 插入闪回（包含开始和结束标记）
        this.sceneService.insertFlashbackWithEnd(editor);
        
        new Notice('已插入闪回（含结束标记）');
    }

    /**
     * 处理插入动作描述操作
     * 在光标位置插入 △ 符号
     */
    handleInsertAction(): void {
        const editor = this.getActiveEditor();
        if (!editor) {
            new Notice('请先打开一个 Markdown 文件');
            return;
        }

        const cursor = editor.getCursor();
        editor.replaceRange('△ ', cursor);
        editor.setCursor({ line: cursor.line, ch: cursor.ch + 2 });
    }

    /**
     * 处理插入旁白/内心独白操作
     * @param type 旁白类型：'os' | 'narrator' | 'vo'
     */
    handleInsertNarration(type: 'os' | 'narrator' | 'vo'): void {
        const editor = this.getActiveEditor();
        if (!editor) {
            new Notice('请先打开一个 Markdown 文件');
            return;
        }

        // 根据类型构建插入文本
        let insertText: string;
        switch (type) {
            case 'os':
                insertText = '（OS）';
                break;
            case 'narrator':
                insertText = '【旁白】';
                break;
            case 'vo':
                insertText = '（VO）';
                break;
        }

        // 获取当前光标位置
        const cursor = editor.getCursor();
        
        // 插入文本
        editor.replaceRange(insertText, cursor);
        
        // 移动光标到插入文本后
        editor.setCursor({
            line: cursor.line,
            ch: cursor.ch + insertText.length
        });
    }

    /**
     * 注册所有导出器
     * 包括 Word、PDF、分场表导出器
     */
    private registerExporters(): void {
        this.exportService.registerExporter(new WordExporter());
        this.exportService.registerExporter(new PDFExporter());
        this.exportService.registerExporter(new BreakdownExporter());
    }

    /**
     * 获取时间预设列表
     * 合并全局默认预设和项目自定义预设
     * @returns 时间预设数组
     */
    getTimePresets(): string[] {
        const projectSettings = this.projectService.getCurrentSettings();
        const customPresets = projectSettings?.customTimePresets || [];
        const defaultPresets = this.globalSettings.defaultTimePresets;
        
        // 合并预设，去重，自定义预设优先
        const allPresets = [...customPresets];
        for (const preset of defaultPresets) {
            if (!allPresets.includes(preset)) {
                allPresets.push(preset);
            }
        }
        
        return allPresets;
    }

    /**
     * 获取地点预设列表
     * 合并最近使用地点、项目自定义预设和全局默认预设
     * @returns 地点预设数组
     */
    getLocationPresets(): string[] {
        const projectSettings = this.projectService.getCurrentSettings();
        const recentLocations = projectSettings?.recentLocations || [];
        const customPresets = projectSettings?.customLocationPresets || [];
        const defaultPresets = this.globalSettings.defaultLocationPresets;
        
        // 合并预设，去重，最近使用的地点优先
        const allPresets = [...recentLocations];
        for (const preset of customPresets) {
            if (!allPresets.includes(preset)) {
                allPresets.push(preset);
            }
        }
        for (const preset of defaultPresets) {
            if (!allPresets.includes(preset)) {
                allPresets.push(preset);
            }
        }
        
        return allPresets;
    }

    /**
     * 添加最近使用的地点
     * @param location 地点名称
     */
    async addRecentLocation(location: string): Promise<void> {
        await this.projectService.addRecentLocation(location);
    }

    /**
     * 处理导出操作
     * @param exporterName 导出器名称
     */
    async handleExport(exporterName: string): Promise<void> {
        const view = this.getActiveMarkdownView();
        if (!view) {
            new Notice('请先打开一个 Markdown 文件');
            return;
        }

        const content = view.editor.getValue();
        const activeFile = this.app.workspace.getActiveFile();
        
        if (!activeFile) {
            new Notice('无法获取当前文件信息');
            return;
        }

        // 更新场景索引
        this.updateSceneIndex();
        const index = this.sceneService.getIndex();

        // 获取项目设定
        const settings = this.projectService.getCurrentSettings();
        if (!settings) {
            new Notice('请先配置项目设定');
            return;
        }

        try {
            // 构建文件名（不含扩展名）
            const baseFilename = settings.title || activeFile.basename;

            // 执行导出并下载
            await this.exportService.exportAndDownload(
                exporterName,
                content,
                index,
                settings,
                { includeSettings: true },
                baseFilename
            );

            new Notice(`已导出为 ${exporterName} 格式`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            new Notice(`导出失败: ${errorMessage}`);
            console.error('导出失败:', error);
        }
    }
}
