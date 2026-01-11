/**
 * ScriptNote - 短剧剧本写作插件 - 侧边面板视图
 * 使用标签页组织功能：写作（默认）| 项目
 */

import { ItemView, WorkspaceLeaf, Notice, MarkdownView } from 'obsidian';
import type ScreenplayPlugin from '../main';
import { SIDE_PANEL_VIEW_TYPE } from '../utils/constants';

/**
 * 标签页类型
 */
type TabType = 'writing' | 'project';

/**
 * 人物出场信息
 */
interface CharacterAppearance {
    /** 集名称 */
    episode: string;
    /** 行号（从0开始） */
    lineNumber: number;
    /** 台词预览 */
    preview: string;
}

/**
 * 人物统计详情
 */
interface CharacterStatDetail {
    /** 人物名 */
    name: string;
    /** 台词总数 */
    count: number;
    /** 出场详情 */
    appearances: CharacterAppearance[];
    /** 出现的集列表（去重） */
    episodes: string[];
}

/**
 * 侧边面板视图类
 * 继承 ItemView 创建右侧功能面板
 */
export class SidePanelView extends ItemView {
    /** 插件实例引用 */
    plugin: ScreenplayPlugin;

    /** 面板内容容器 */
    private panelContentEl: HTMLElement | null = null;

    /** 当前激活的标签页 */
    private activeTab: TabType = 'writing';

    /** 标签页内容容器 */
    private tabContentEl: HTMLElement | null = null;

    /** 字数统计容器 */
    private wordStatsEl: HTMLElement | null = null;

    /** 展开的人物列表 */
    private expandedCharacters: Set<string> = new Set();

    /** 排除的人物列表（用户手动排除的误识别项） */
    private excludedCharacters: Set<string> = new Set();

    /** 取消订阅函数列表 */
    private unsubscribers: (() => void)[] = [];

    /**
     * 构造函数
     * @param leaf 工作区叶子节点
     * @param plugin 插件实例
     */
    constructor(leaf: WorkspaceLeaf, plugin: ScreenplayPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    /**
     * 获取当前活动的 MarkdownView
     * 注意：只返回真正活动的视图，不会回退到其他打开的文件
     * @returns MarkdownView 实例，如果没有返回 null
     */
    private getMarkdownView(): MarkdownView | null {
        // 方法1：直接从活动视图获取
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) return view;

        // 方法2：从活动文件获取对应的视图
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === 'md') {
            const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
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
     * 获取视图类型标识
     */
    getViewType(): string {
        return SIDE_PANEL_VIEW_TYPE;
    }

    /**
     * 获取显示文本
     */
    getDisplayText(): string {
        return 'ScriptNote';
    }

    /**
     * 获取图标
     */
    getIcon(): string {
        return 'film';
    }

    /**
     * 面板打开时调用
     */
    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('screenplay-side-panel');

        this.panelContentEl = container.createDiv({ cls: 'screenplay-panel-content' });
        this.renderPanel();
        this.subscribeToEvents();
    }

    /**
     * 面板关闭时调用
     */
    async onClose(): Promise<void> {
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
        this.panelContentEl = null;
    }

    /**
     * 订阅事件
     */
    private subscribeToEvents(): void {
        // 监听编辑器变化，更新字数统计
        const editorChangeHandler = () => {
            if (this.activeTab === 'writing') {
                this.refreshWordStats();
            }
        };

        this.registerEvent(
            this.plugin.app.workspace.on('editor-change', editorChangeHandler)
        );

        // 监听文件切换 - 重新渲染整个面板
        this.registerEvent(
            this.plugin.app.workspace.on('file-open', () => {
                // 重新渲染整个面板，因为可能切换到了不同类型的文件
                this.renderPanel();
            })
        );

        // 监听活动叶子变化（当用户点击不同的编辑器标签时）
        this.registerEvent(
            this.plugin.app.workspace.on('active-leaf-change', () => {
                // 重新渲染整个面板
                this.renderPanel();
            })
        );
    }

    /**
     * 渲染面板内容
     */
    private renderPanel(): void {
        if (!this.panelContentEl) return;
        this.panelContentEl.empty();

        // 渲染标题
        this.renderHeader();

        // 渲染标签页切换
        this.renderTabs();

        // 渲染标签页内容容器
        this.tabContentEl = this.panelContentEl.createDiv({ cls: 'screenplay-tab-content' });

        // 渲染当前标签页内容
        this.renderTabContent();
    }

    /**
     * 渲染面板标题
     */
    private renderHeader(): void {
        if (!this.panelContentEl) return;
        const header = this.panelContentEl.createDiv({ cls: 'screenplay-panel-header' });
        header.createEl('h3', { text: 'ScriptNote' });
    }

    /**
     * 渲染标签页切换按钮
     */
    private renderTabs(): void {
        if (!this.panelContentEl) return;

        const tabsContainer = this.panelContentEl.createDiv({ cls: 'screenplay-tabs' });

        // 写作标签
        const writingTab = tabsContainer.createDiv({
            cls: `screenplay-tab ${this.activeTab === 'writing' ? 'active' : ''}`,
            text: '写作'
        });
        writingTab.addEventListener('click', () => this.switchTab('writing'));

        // 项目标签
        const projectTab = tabsContainer.createDiv({
            cls: `screenplay-tab ${this.activeTab === 'project' ? 'active' : ''}`,
            text: '项目'
        });
        projectTab.addEventListener('click', () => this.switchTab('project'));
    }

    /**
     * 切换标签页
     * @param tab 目标标签页
     */
    private switchTab(tab: TabType): void {
        if (this.activeTab === tab) return;
        this.activeTab = tab;
        this.renderPanel();
    }

    /**
     * 渲染标签页内容
     */
    private renderTabContent(): void {
        if (!this.tabContentEl) return;
        this.tabContentEl.empty();

        if (this.activeTab === 'writing') {
            this.renderWritingTab();
        } else {
            this.renderProjectTab();
        }
    }

    // ==================== 写作标签页 ====================

    /**
     * 检查当前文件是否为剧本文件
     * 规则：
     * - 必须在已注册的剧本项目文件夹内
     * - 必须有 type: screenplay 标签
     * @returns 检查结果
     */
    private checkIsScreenplayFile(): { 
        isScreenplay: boolean; 
        inProject: boolean; 
        hasTag: boolean; 
        filePath: string; 
        projectFolder: string;
        hasProjects: boolean;
    } {
        const view = this.getMarkdownView();
        if (!view || !view.file) {
            return { 
                isScreenplay: false, 
                inProject: false, 
                hasTag: false, 
                filePath: '', 
                projectFolder: '',
                hasProjects: (this.plugin.globalSettings.screenplayProjects || []).length > 0
            };
        }

        const filePath = view.file.path;
        const projects = this.plugin.globalSettings.screenplayProjects || [];
        const hasProjects = projects.length > 0;
        
        // 检查是否在任一剧本项目文件夹内
        let inProject = false;
        let projectFolder = '';
        const normalizedPath = filePath.replace(/\\/g, '/');
        
        for (const project of projects) {
            const normalizedProject = project.replace(/\\/g, '/');
            if (normalizedPath.startsWith(normalizedProject + '/') || normalizedPath === normalizedProject) {
                inProject = true;
                projectFolder = project;
                break;
            }
        }

        // 检查是否有 type: screenplay 标签
        const content = view.editor.getValue();
        const hasTag = this.hasScreenplayTag(content);

        // 必须在项目内且有标签
        const isScreenplay = inProject && hasTag;

        return { isScreenplay, inProject, hasTag, filePath, projectFolder, hasProjects };
    }

    /**
     * 获取当前文件所在的文件夹路径
     */
    private getCurrentFileFolder(): string | null {
        const view = this.getMarkdownView();
        if (!view || !view.file) return null;
        
        const filePath = view.file.path;
        const lastSlash = filePath.lastIndexOf('/');
        if (lastSlash === -1) return ''; // 根目录
        return filePath.substring(0, lastSlash);
    }

    /**
     * 添加当前文件夹为剧本项目
     */
    private async addCurrentFolderAsProject(): Promise<void> {
        const folder = this.getCurrentFileFolder();
        
        if (folder === null) {
            new Notice('请先打开一个文件');
            return;
        }

        const projects = this.plugin.globalSettings.screenplayProjects || [];
        
        // 检查是否已存在
        if (projects.includes(folder)) {
            new Notice('该文件夹已是剧本项目');
            return;
        }

        // 添加项目
        projects.push(folder);
        this.plugin.globalSettings.screenplayProjects = projects;
        await this.plugin.saveSettings();
        
        new Notice(`已添加剧本项目：${folder || '根目录'}`);
        this.renderPanel();
    }

    /**
     * 检查文档是否有 type: screenplay 标签
     * @param content 文档内容
     * @returns 是否有标签
     */
    private hasScreenplayTag(content: string): boolean {
        // 检查 frontmatter
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            // 检查 type: screenplay
            return /^type:\s*screenplay\s*$/m.test(frontmatter);
        }
        return false;
    }

    /**
     * 添加剧本标签到当前文档
     */
    private async addScreenplayTag(): Promise<void> {
        const view = this.getMarkdownView();
        if (!view) {
            new Notice('请先打开一个 Markdown 文件');
            return;
        }

        const editor = view.editor;
        const content = editor.getValue();

        // 检查是否已有 frontmatter
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        
        if (frontmatterMatch) {
            // 已有 frontmatter，添加 type 字段
            const frontmatter = frontmatterMatch[1];
            if (/^type:/m.test(frontmatter)) {
                // 已有 type 字段，替换
                const newFrontmatter = frontmatter.replace(/^type:.*$/m, 'type: screenplay');
                const newContent = content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFrontmatter}\n---`);
                editor.setValue(newContent);
            } else {
                // 没有 type 字段，添加
                const newFrontmatter = frontmatter + '\ntype: screenplay';
                const newContent = content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFrontmatter}\n---`);
                editor.setValue(newContent);
            }
        } else {
            // 没有 frontmatter，创建新的
            const newContent = `---\ntype: screenplay\n---\n\n${content}`;
            editor.setValue(newContent);
        }

        new Notice('已添加剧本标签');
        this.renderPanel();
    }

    /**
     * 渲染写作标签页
     */
    private renderWritingTab(): void {
        if (!this.tabContentEl) return;

        // 检查是否为剧本文件
        const checkResult = this.checkIsScreenplayFile();

        // 如果不是剧本文件，显示提示
        if (!checkResult.isScreenplay) {
            this.renderNotScreenplayHint(checkResult);
            return;
        }

        // 显示当前项目信息
        this.renderProjectInfo(checkResult.projectFolder);

        // 字数统计区域
        this.renderWordStatsSection();

        // 快速插入区域
        this.renderQuickInsertSection();

        // 导出区域
        this.renderExportSection();
    }

    /**
     * 渲染当前项目信息
     */
    private renderProjectInfo(projectFolder: string): void {
        if (!this.tabContentEl) return;

        const infoDiv = this.tabContentEl.createDiv({ cls: 'screenplay-project-info-bar' });
        infoDiv.createSpan({ cls: 'screenplay-project-icon', text: '📁' });
        infoDiv.createSpan({ 
            cls: 'screenplay-project-name-text',
            text: projectFolder || '根目录'
        });
    }

    /**
     * 渲染非剧本文件提示
     */
    private renderNotScreenplayHint(checkResult: { 
        inProject: boolean; 
        hasTag: boolean; 
        filePath: string; 
        projectFolder: string;
        hasProjects: boolean;
    }): void {
        if (!this.tabContentEl) return;

        const { inProject, hasTag, hasProjects } = checkResult;

        const hintSection = this.tabContentEl.createDiv({ cls: 'screenplay-not-screenplay-hint' });
        
        // 图标
        hintSection.createDiv({ cls: 'screenplay-hint-icon', text: '🎬' });
        
        // 标题
        if (!hasProjects) {
            hintSection.createEl('h4', { text: '开始创作剧本' });
        } else if (!inProject) {
            hintSection.createEl('h4', { text: '选择或创建剧本项目' });
        } else {
            hintSection.createEl('h4', { text: '标记为剧本文件' });
        }

        // 操作按钮
        const actionsDiv = hintSection.createDiv({ cls: 'screenplay-hint-actions' });
        
        // 如果在项目内但没有标签，显示添加标签按钮
        if (inProject && !hasTag) {
            const addTagBtn = actionsDiv.createEl('button', {
                cls: 'screenplay-btn screenplay-btn-primary screenplay-btn-full',
                text: '🏷️ 标记为剧本'
            });
            addTagBtn.addEventListener('click', () => this.addScreenplayTag());
        } else {
            // 创建剧本项目按钮
            const createBtn = actionsDiv.createEl('button', {
                cls: 'screenplay-btn screenplay-btn-primary screenplay-btn-full',
                text: '📁 创建剧本项目'
            });
            createBtn.addEventListener('click', () => this.addCurrentFolderAsProject());

            // 如果有已有项目，显示选择按钮
            if (hasProjects) {
                const selectBtn = actionsDiv.createEl('button', {
                    cls: 'screenplay-btn screenplay-btn-full',
                    text: '📂 选择已有项目'
                });
                selectBtn.addEventListener('click', () => this.showProjectSelector());
            }
        }
    }

    /**
     * 显示项目选择器
     */
    private showProjectSelector(): void {
        const projects = this.plugin.globalSettings.screenplayProjects || [];
        if (projects.length === 0) {
            new Notice('暂无剧本项目');
            return;
        }

        // 创建模态对话框
        const overlay = document.createElement('div');
        overlay.className = 'screenplay-modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'screenplay-modal screenplay-project-selector-modal';
        
        // 标题
        const headerEl = modal.createDiv({ cls: 'screenplay-modal-header' });
        headerEl.createEl('h3', { text: '选择剧本项目' });
        
        const closeBtn = headerEl.createEl('button', { cls: 'screenplay-modal-close' });
        closeBtn.innerHTML = '×';
        closeBtn.addEventListener('click', () => overlay.remove());
        
        // 项目列表
        const bodyEl = modal.createDiv({ cls: 'screenplay-modal-body' });
        const listEl = bodyEl.createDiv({ cls: 'screenplay-project-select-list' });
        
        for (const project of projects) {
            const itemEl = listEl.createDiv({ cls: 'screenplay-project-select-item' });
            itemEl.createSpan({ cls: 'screenplay-project-select-icon', text: '📁' });
            itemEl.createSpan({ cls: 'screenplay-project-select-name', text: project || '根目录' });
            
            itemEl.addEventListener('click', async () => {
                // 打开该项目文件夹
                const folder = this.plugin.app.vault.getAbstractFileByPath(project);
                if (folder) {
                    // 尝试打开文件夹中的第一个 md 文件
                    const files = this.plugin.app.vault.getMarkdownFiles().filter(f => 
                        f.path.startsWith(project + '/')
                    );
                    if (files.length > 0) {
                        await this.plugin.app.workspace.openLinkText(files[0].path, '', false);
                    }
                }
                overlay.remove();
                new Notice(`已切换到项目：${project || '根目录'}`);
            });
        }
        
        overlay.appendChild(modal);
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
        
        document.body.appendChild(overlay);
    }

    /**
     * 渲染字数统计区域
     */
    private renderWordStatsSection(): void {
        if (!this.tabContentEl) return;

        const section = this.tabContentEl.createDiv({ cls: 'screenplay-section' });
        section.createDiv({ cls: 'screenplay-section-header' }).createEl('h4', { text: '📊 统计' });

        this.wordStatsEl = section.createDiv({ cls: 'screenplay-stats-content' });
        this.refreshWordStats();
    }

    /**
     * 刷新统计信息
     */
    private refreshWordStats(): void {
        if (!this.wordStatsEl) return;
        this.wordStatsEl.empty();

        const view = this.getMarkdownView();
        if (!view) {
            this.wordStatsEl.createEl('p', {
                text: '请打开一个 Markdown 文件',
                cls: 'screenplay-placeholder'
            });
            return;
        }

        const content = view.editor.getValue();
        
        // 字数统计
        const wordStats = this.calculateWordStats(content);
        this.renderWordStatsDisplay(wordStats);
        
        // 人物统计（带出场详情）
        const characterStats = this.calculateCharacterStatsDetailed(content);
        this.renderCharacterStatsDetailedDisplay(characterStats);
    }

    /**
     * 渲染字数统计显示
     */
    private renderWordStatsDisplay(stats: { total: number; episodes: { name: string; count: number }[] }): void {
        if (!this.wordStatsEl) return;

        const wordSection = this.wordStatsEl.createDiv({ cls: 'screenplay-stat-section' });
        wordSection.createEl('div', { text: '字数统计', cls: 'screenplay-stat-title' });

        // 显示总字数
        const totalDiv = wordSection.createDiv({ cls: 'screenplay-stat-total' });
        totalDiv.createSpan({ text: '总字数：' });
        totalDiv.createSpan({ text: `${stats.total}`, cls: 'screenplay-stat-number' });

        // 显示每集字数
        if (stats.episodes.length > 0) {
            const episodesDiv = wordSection.createDiv({ cls: 'screenplay-stat-episodes' });
            for (const ep of stats.episodes) {
                const epDiv = episodesDiv.createDiv({ cls: 'screenplay-stat-episode' });
                epDiv.createSpan({ text: `${ep.name}：` });
                epDiv.createSpan({ text: `${ep.count} 字`, cls: 'screenplay-stat-number' });
            }
        }
    }

    /**
     * 渲染人物统计显示（带出场详情和跳转）
     */
    private renderCharacterStatsDetailedDisplay(stats: CharacterStatDetail[]): void {
        if (!this.wordStatsEl) return;

        const charSection = this.wordStatsEl.createDiv({ cls: 'screenplay-stat-section' });
        charSection.createEl('div', { text: '人物统计', cls: 'screenplay-stat-title' });

        if (stats.length === 0) {
            charSection.createEl('p', { text: '暂无人物台词', cls: 'screenplay-placeholder' });
            return;
        }

        const charList = charSection.createDiv({ cls: 'screenplay-char-list' });
        for (const char of stats) {
            const isExpanded = this.expandedCharacters.has(char.name);
            
            // 人物行容器
            const charContainer = charList.createDiv({ cls: 'screenplay-char-container' });
            
            // 人物主行（可点击展开）
            const charDiv = charContainer.createDiv({ 
                cls: `screenplay-char-item ${isExpanded ? 'expanded' : ''}` 
            });
            
            // 展开图标
            charDiv.createSpan({ 
                cls: 'screenplay-char-expand-icon',
                text: isExpanded ? '▼' : '▶'
            });
            
            // 人物名
            charDiv.createSpan({ text: char.name, cls: 'screenplay-char-name' });
            
            // 出现集数
            const episodeText = char.episodes.length > 0 
                ? `${char.episodes.length}集` 
                : '';
            charDiv.createSpan({ text: episodeText, cls: 'screenplay-char-episodes' });
            
            // 台词数
            charDiv.createSpan({ text: `${char.count} 句`, cls: 'screenplay-char-count' });
            
            // 删除按钮（排除此人物）
            const deleteBtn = charDiv.createSpan({ 
                cls: 'screenplay-char-delete-btn',
                text: '×'
            });
            deleteBtn.title = '排除此项（不是人物）';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.excludeCharacter(char.name);
            });
            
            // 点击展开/收起
            charDiv.addEventListener('click', () => {
                if (this.expandedCharacters.has(char.name)) {
                    this.expandedCharacters.delete(char.name);
                } else {
                    this.expandedCharacters.add(char.name);
                }
                this.refreshWordStats();
            });
            
            // 展开时显示出场详情
            if (isExpanded && char.appearances.length > 0) {
                const detailDiv = charContainer.createDiv({ cls: 'screenplay-char-detail' });
                
                // 按集分组显示
                const groupedByEpisode = new Map<string, CharacterAppearance[]>();
                for (const app of char.appearances) {
                    const key = app.episode || '未分集';
                    if (!groupedByEpisode.has(key)) {
                        groupedByEpisode.set(key, []);
                    }
                    groupedByEpisode.get(key)!.push(app);
                }
                
                for (const [episode, appearances] of groupedByEpisode) {
                    const episodeGroup = detailDiv.createDiv({ cls: 'screenplay-char-episode-group' });
                    episodeGroup.createDiv({ 
                        cls: 'screenplay-char-episode-header',
                        text: `${episode}（${appearances.length}句）`
                    });
                    
                    // 显示前5条台词预览，可点击跳转
                    const previewList = episodeGroup.createDiv({ cls: 'screenplay-char-preview-list' });
                    const showCount = Math.min(appearances.length, 5);
                    for (let i = 0; i < showCount; i++) {
                        const app = appearances[i];
                        const previewItem = previewList.createDiv({ cls: 'screenplay-char-preview-item' });
                        previewItem.createSpan({ 
                            text: `L${app.lineNumber + 1}: `,
                            cls: 'screenplay-char-line-num'
                        });
                        previewItem.createSpan({ 
                            text: app.preview.length > 30 ? app.preview.slice(0, 30) + '...' : app.preview,
                            cls: 'screenplay-char-preview-text'
                        });
                        
                        // 点击跳转到对应行
                        previewItem.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.jumpToLine(app.lineNumber);
                        });
                    }
                    
                    // 如果超过5条，显示提示
                    if (appearances.length > 5) {
                        previewList.createDiv({ 
                            cls: 'screenplay-char-more-hint',
                            text: `还有 ${appearances.length - 5} 条...`
                        });
                    }
                }
            }
        }
        
        // 如果有排除的人物，显示恢复按钮
        if (this.excludedCharacters.size > 0) {
            const restoreDiv = charSection.createDiv({ cls: 'screenplay-char-restore' });
            restoreDiv.createSpan({ 
                text: `已排除 ${this.excludedCharacters.size} 项`,
                cls: 'screenplay-char-restore-text'
            });
            const restoreBtn = restoreDiv.createEl('button', {
                cls: 'screenplay-btn screenplay-btn-small',
                text: '恢复全部'
            });
            restoreBtn.addEventListener('click', () => {
                this.excludedCharacters.clear();
                this.refreshWordStats();
            });
        }
    }

    /**
     * 排除人物（从统计中移除）
     * @param name 人物名
     */
    private excludeCharacter(name: string): void {
        this.excludedCharacters.add(name);
        new Notice(`已排除"${name}"，不再计入人物统计`);
        this.refreshWordStats();
    }

    /**
     * 跳转到指定行
     * @param lineNumber 行号（从0开始）
     */
    private jumpToLine(lineNumber: number): void {
        const view = this.getMarkdownView();
        if (!view) return;
        
        const editor = view.editor;
        editor.setCursor({ line: lineNumber, ch: 0 });
        editor.scrollIntoView({ from: { line: lineNumber, ch: 0 }, to: { line: lineNumber, ch: 0 } }, true);
        editor.focus();
    }

    /**
     * 计算字数统计
     * @param content 文档内容
     * @returns 统计结果
     */
    private calculateWordStats(content: string): { total: number; episodes: { name: string; count: number }[] } {
        // 移除"人物："行，不计入字数
        const lines = content.split('\n');
        const filteredLines = lines.filter(line => !line.trim().startsWith('人物：'));
        const filteredContent = filteredLines.join('\n');

        // 计算总字数（中文字符 + 英文单词）
        const total = this.countWords(filteredContent);

        // 按集分割统计
        const episodes: { name: string; count: number }[] = [];
        const episodeRegex = /^#\s*(第.+集)/gm;
        const matches = [...content.matchAll(episodeRegex)];

        if (matches.length > 0) {
            for (let i = 0; i < matches.length; i++) {
                const start = matches[i].index!;
                const end = i < matches.length - 1 ? matches[i + 1].index! : content.length;
                const episodeContent = content.slice(start, end);
                
                // 过滤人物行
                const epLines = episodeContent.split('\n').filter(line => !line.trim().startsWith('人物：'));
                const epFiltered = epLines.join('\n');
                
                episodes.push({
                    name: matches[i][1],
                    count: this.countWords(epFiltered)
                });
            }
        }

        return { total, episodes };
    }

    /**
     * 计算人物统计（带出场详情）
     * 统计每个角色的台词数量和出场位置
     * 只统计在"第X集"标题之后的内容
     * @param content 文档内容
     * @returns 人物统计详情数组，按台词数量降序排列
     */
    private calculateCharacterStatsDetailed(content: string): CharacterStatDetail[] {
        const characterData = new Map<string, { count: number; appearances: CharacterAppearance[] }>();
        const lines = content.split('\n');

        // 匹配角色台词行的正则
        // 格式：角色名 + 可选的括号内容（动作/表情）+ 可选的 OS/VO + 冒号
        // 例如：张三：、张三OS：、张三（笑）：、张三（哭泣）VO：、李四（愤怒地）：
        // 捕获组1：角色名（不含括号和OS/VO）
        const dialogueRegex = /^([^：:【】\s（()]+)(?:（[^）]*）|\([^)]*\))?(?:OS|VO|（OS）|（VO）)?[：:]/;

        // 追踪当前所在的集
        let currentEpisode = '';
        
        // 追踪是否在 frontmatter 中
        let inFrontmatter = false;
        let frontmatterStarted = false;
        
        // 追踪是否已经进入剧本正文（遇到第一个"第X集"标题后）
        let inScriptContent = false;
        
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const trimmedLine = line.trim();

            // 处理 frontmatter（--- 之间的内容）
            if (trimmedLine === '---') {
                if (!frontmatterStarted) {
                    // 第一个 ---，开始 frontmatter
                    frontmatterStarted = true;
                    inFrontmatter = true;
                    continue;
                } else if (inFrontmatter) {
                    // 第二个 ---，结束 frontmatter
                    inFrontmatter = false;
                    continue;
                }
            }
            
            // 跳过 frontmatter 中的内容
            if (inFrontmatter) continue;

            // 跳过空行
            if (!trimmedLine) continue;

            // 检测集标题（第X集）
            const episodeMatch = trimmedLine.match(/^#\s*(第.+集)/);
            if (episodeMatch) {
                currentEpisode = episodeMatch[1];
                inScriptContent = true; // 进入剧本正文
                continue;
            }
            
            // 如果还没有遇到"第X集"标题，跳过（不统计集标题之前的内容）
            if (!inScriptContent) continue;

            // 跳过"人物："行（场景头中的出场人物列表）
            if (trimmedLine.startsWith('人物：') || trimmedLine.startsWith('人物:')) continue;

            // 跳过【字幕：xxx】格式（不是角色）
            if (trimmedLine.startsWith('【字幕：') || trimmedLine.startsWith('【字幕:')) continue;

            // 跳过【旁白】格式（这是旁白标记，不是角色名）
            if (trimmedLine.startsWith('【旁白】')) continue;

            // 跳过场景头（格式：数字-数字 开头）
            if (/^\d+-\d+\s/.test(trimmedLine)) continue;

            // 跳过动作描述（△ 开头）
            if (trimmedLine.startsWith('△')) continue;

            // 跳过闪回标记
            if (trimmedLine === '【闪回】' || trimmedLine === '【闪回结束】') continue;

            // 匹配角色台词
            const match = trimmedLine.match(dialogueRegex);
            if (match) {
                // 提取标准化的角色名
                let characterName = match[1].trim();

                // 跳过一些特殊格式（如【xxx】开头的）
                if (characterName.startsWith('【')) continue;
                
                // 跳过用户排除的人物
                if (this.excludedCharacters.has(characterName)) continue;

                // 提取台词内容（冒号后的部分）
                const colonIndex = trimmedLine.indexOf('：') !== -1 
                    ? trimmedLine.indexOf('：') 
                    : trimmedLine.indexOf(':');
                const dialogueContent = colonIndex !== -1 
                    ? trimmedLine.slice(colonIndex + 1).trim() 
                    : '';

                // 获取或创建角色数据
                if (!characterData.has(characterName)) {
                    characterData.set(characterName, { count: 0, appearances: [] });
                }
                
                const data = characterData.get(characterName)!;
                data.count++;
                data.appearances.push({
                    episode: currentEpisode,
                    lineNumber: lineIndex,
                    preview: dialogueContent
                });
            }
        }

        // 转换为数组并计算出现的集列表
        const result: CharacterStatDetail[] = Array.from(characterData.entries())
            .map(([name, data]) => {
                // 获取去重的集列表
                const episodeSet = new Set<string>();
                for (const app of data.appearances) {
                    if (app.episode) {
                        episodeSet.add(app.episode);
                    }
                }
                
                return {
                    name,
                    count: data.count,
                    appearances: data.appearances,
                    episodes: Array.from(episodeSet)
                };
            })
            .sort((a, b) => b.count - a.count);

        return result;
    }

    /**
     * 统计字数
     * @param text 文本内容
     * @returns 字数
     */
    private countWords(text: string): number {
        // 移除 Markdown 标记
        let cleaned = text
            .replace(/^#+\s*/gm, '')  // 标题
            .replace(/\*\*|__/g, '')   // 粗体
            .replace(/\*|_/g, '')      // 斜体
            .replace(/`[^`]*`/g, '')   // 行内代码
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // 链接
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')   // 图片
            .trim();

        // 统计中文字符
        const chineseChars = (cleaned.match(/[\u4e00-\u9fa5]/g) || []).length;
        
        // 统计英文单词
        const englishWords = (cleaned.match(/[a-zA-Z]+/g) || []).length;
        
        return chineseChars + englishWords;
    }

    /**
     * 渲染快速插入区域
     */
    private renderQuickInsertSection(): void {
        if (!this.tabContentEl) return;

        const section = this.tabContentEl.createDiv({ cls: 'screenplay-section' });
        section.createDiv({ cls: 'screenplay-section-header' }).createEl('h4', { text: '📝 快速插入' });

        const content = section.createDiv({ cls: 'screenplay-section-content' });

        // 第一行按钮
        const row1 = content.createDiv({ cls: 'screenplay-button-row' });
        this.createButton(row1, '插入场景', () => this.insertScene());
        this.createButton(row1, '新建一集', () => this.insertNewEpisode());

        // 第二行按钮
        const row2 = content.createDiv({ cls: 'screenplay-button-row' });
        this.createButton(row2, '△ 动作描述', () => this.insertAction());
        this.createButton(row2, '插入闪回', () => this.insertFlashback());

        // 特殊台词格式
        content.createDiv({ cls: 'screenplay-subsection-label', text: '特殊台词格式' });

        const row3 = content.createDiv({ cls: 'screenplay-button-row' });
        this.createButton(row3, '旁白（OS）', () => this.insertNarration('os'));
        this.createButton(row3, '内心独白（VO）', () => this.insertNarration('vo'));
    }

    /**
     * 创建按钮
     */
    private createButton(container: HTMLElement, text: string, onClick: () => void): void {
        const btn = container.createEl('button', {
            cls: 'screenplay-btn',
            text: text
        });
        btn.addEventListener('click', onClick);
    }

    /**
     * 插入场景头
     * 委托给 main.ts 的 handleInsertScene 方法，确保与快捷键行为一致
     */
    private insertScene(): void {
        this.plugin.handleInsertScene();
    }

    /**
     * 插入新一集
     * 委托给 main.ts 的 handleNewEpisode 方法，确保与快捷键行为一致
     */
    private insertNewEpisode(): void {
        this.plugin.handleNewEpisode();
    }

    /**
     * 插入动作描述符号
     * 委托给 main.ts 的 handleInsertAction 方法，确保与快捷键行为一致
     */
    private insertAction(): void {
        this.plugin.handleInsertAction();
    }

    /**
     * 插入闪回（含结束和场景头）
     * 委托给 main.ts 的 handleInsertFlashbackWithEnd 方法，确保与快捷键行为一致
     * 注意：面板按钮插入的是完整闪回（含开始和结束标记）
     */
    private insertFlashback(): void {
        this.plugin.handleInsertFlashbackWithEnd();
    }

    /**
     * 插入旁白/内心独白
     * 委托给 main.ts 的 handleInsertNarration 方法，确保与快捷键行为一致
     * @param type 类型：os | narrator | vo
     */
    private insertNarration(type: 'os' | 'narrator' | 'vo'): void {
        this.plugin.handleInsertNarration(type);
    }

    /**
     * 渲染导出区域
     */
    private renderExportSection(): void {
        if (!this.tabContentEl) return;

        const section = this.tabContentEl.createDiv({ cls: 'screenplay-section' });
        section.createDiv({ cls: 'screenplay-section-header' }).createEl('h4', { text: '📤 导出' });

        const content = section.createDiv({ cls: 'screenplay-section-content' });
        const row = content.createDiv({ cls: 'screenplay-button-row' });
        
        this.createButton(row, '导出 Word', () => this.exportWord());
    }

    /**
     * 导出 Word 文档
     */
    private async exportWord(): Promise<void> {
        const view = this.getMarkdownView();
        if (!view || !view.file) {
            new Notice('请先打开一个 Markdown 文件');
            return;
        }

        try {
            const content = view.editor.getValue();
            const sceneIndex = this.plugin.sceneService.parseDocument(content);
            
            // 创建简单的设定对象
            const settings = {
                version: '1.0',
                title: view.file.basename,
                synopsis: '',
                characters: [],
                outline: '',
                customTimePresets: [],
                customLocationPresets: [],
                recentLocations: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                scriptFile: '',
                settingsFile: ''
            };

            // 获取 Word 导出器并设置格式
            const wordExporter = this.plugin.exportService.getExporter('word');
            if (wordExporter && 'setFormat' in wordExporter) {
                // 使用全局设置中的导出格式
                const formatSettings = this.plugin.globalSettings.exportFormat;
                (wordExporter as { setFormat: (format: typeof formatSettings) => void }).setFormat(formatSettings);
            }

            const blob = await this.plugin.exportService.export(
                'word',
                content,
                sceneIndex,
                settings,
                { includeSettings: false }
            );

            // 下载文件
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${view.file.basename}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            new Notice('Word 文档导出成功');
        } catch (error) {
            console.error('导出失败:', error);
            new Notice('导出失败：' + (error instanceof Error ? error.message : '未知错误'));
        }
    }

    // ==================== 项目标签页 ====================

    /**
     * 渲染项目标签页（保留，后续完善）
     */
    private renderProjectTab(): void {
        if (!this.tabContentEl) return;

        const placeholder = this.tabContentEl.createDiv({ cls: 'screenplay-placeholder-section' });
        placeholder.createEl('p', { text: '🚧 项目管理功能开发中...' });
        placeholder.createEl('p', { 
            text: '此标签页将包含：项目设定、人物管理、AI 生成等功能',
            cls: 'screenplay-hint'
        });
    }
}
