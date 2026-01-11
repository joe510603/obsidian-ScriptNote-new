/**
 * ScriptNote - 项目设定服务
 * 管理项目级设定数据，支持多项目隔离
 * 一个项目 = 一个文件夹，文件夹内所有文件共享同一套设定
 */

import { App, TFile, TFolder, Notice } from 'obsidian';
import { ProjectSettings, Character } from '../types';
import { EventBus } from './EventBus';
import { StateManager } from './StateManager';
import { 
    SETTINGS_VERSION, 
    PROJECT_SETTINGS_DIR, 
    PROJECT_SETTINGS_FILE,
    MAX_RECENT_LOCATIONS 
} from '../utils/constants';

/**
 * 创建默认项目设定
 * @returns 默认的项目设定对象
 */
function createDefaultProjectSettings(): ProjectSettings {
    const now = new Date().toISOString();
    return {
        version: SETTINGS_VERSION,
        title: '',
        synopsis: '',
        characters: [],
        outline: '',
        customTimePresets: [],
        customLocationPresets: [],
        recentLocations: [],
        createdAt: now,
        updatedAt: now,
        scriptFile: '',
        settingsFile: ''
    };
}

/**
 * 项目设定服务类
 * 负责项目级设定数据的管理、持久化和同步
 * 项目以文件夹为单位，设定存储在 .scriptnote/settings.json
 */
export class ProjectService {
    /** Obsidian App 实例 */
    private app: App;

    /** 事件总线 */
    private eventBus: EventBus;

    /** 状态管理器 */
    private stateManager: StateManager;

    /** 设定缓存（项目文件夹路径 -> 设定） */
    private settingsCache: Map<string, ProjectSettings> = new Map();

    /** 当前活动的项目文件夹路径 */
    private currentProjectPath: string | null = null;

    /**
     * 构造函数
     * @param app Obsidian App 实例
     * @param eventBus 事件总线
     * @param stateManager 状态管理器
     */
    constructor(app: App, eventBus: EventBus, stateManager: StateManager) {
        this.app = app;
        this.eventBus = eventBus;
        this.stateManager = stateManager;
    }

    /**
     * 创建新的剧本项目
     * @param projectName 项目名称（将作为文件夹名）
     * @param parentPath 父目录路径（可选，默认为 vault 根目录）
     * @returns 项目文件夹路径
     */
    async createProject(projectName: string, parentPath?: string): Promise<string> {
        // 构建项目文件夹路径
        const projectPath = parentPath 
            ? `${parentPath}/${projectName}`
            : projectName;

        // 检查文件夹是否已存在
        const existingFolder = this.app.vault.getAbstractFileByPath(projectPath);
        if (existingFolder) {
            throw new Error(`文件夹 "${projectName}" 已存在`);
        }

        // 创建项目文件夹
        await this.app.vault.createFolder(projectPath);

        // 创建设定目录
        const settingsDirPath = `${projectPath}/${PROJECT_SETTINGS_DIR}`;
        await this.app.vault.createFolder(settingsDirPath);

        // 创建默认设定文件
        const settings = createDefaultProjectSettings();
        settings.title = projectName;
        
        const settingsFilePath = `${settingsDirPath}/${PROJECT_SETTINGS_FILE}`;
        await this.app.vault.create(settingsFilePath, JSON.stringify(settings, null, 2));

        // 创建默认的剧本文件
        const defaultScriptPath = `${projectPath}/第1集.md`;
        const defaultContent = `# ${projectName} - 第1集\n\n`;
        await this.app.vault.create(defaultScriptPath, defaultContent);

        // 缓存设定
        this.settingsCache.set(projectPath, settings);

        new Notice(`已创建剧本项目: ${projectName}`);

        return projectPath;
    }

    /**
     * 查找文件所属的项目文件夹
     * 向上遍历目录，查找包含 .scriptnote 目录的文件夹
     * @param filePath 文件路径
     * @returns 项目文件夹路径，如果不在项目中返回 null
     */
    findProjectFolder(filePath: string): string | null {
        // 获取文件所在目录
        const parts = filePath.split('/');
        parts.pop(); // 移除文件名
        
        // 从当前目录向上查找
        while (parts.length > 0) {
            const currentPath = parts.join('/');
            const settingsDirPath = currentPath 
                ? `${currentPath}/${PROJECT_SETTINGS_DIR}`
                : PROJECT_SETTINGS_DIR;
            
            const settingsDir = this.app.vault.getAbstractFileByPath(settingsDirPath);
            if (settingsDir instanceof TFolder) {
                return currentPath || '/';
            }
            
            parts.pop();
        }

        // 检查根目录
        const rootSettingsDir = this.app.vault.getAbstractFileByPath(PROJECT_SETTINGS_DIR);
        if (rootSettingsDir instanceof TFolder) {
            return '';
        }

        return null;
    }

    /**
     * 加载项目设定
     * @param projectPath 项目文件夹路径
     * @returns 项目设定
     */
    async loadSettings(projectPath: string): Promise<ProjectSettings> {
        // 检查缓存
        if (this.settingsCache.has(projectPath)) {
            const cached = this.settingsCache.get(projectPath)!;
            this.currentProjectPath = projectPath;
            this.stateManager.setProjectSettings(cached);
            return cached;
        }

        const settingsFilePath = this.getSettingsFilePath(projectPath);
        let settings: ProjectSettings;

        try {
            const file = this.app.vault.getAbstractFileByPath(settingsFilePath);
            
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                settings = JSON.parse(content) as ProjectSettings;
                settings = this.migrateSettings(settings);
            } else {
                // 设定文件不存在，创建默认设定
                settings = createDefaultProjectSettings();
                await this.ensureSettingsDir(projectPath);
                await this.saveSettingsToFile(settingsFilePath, settings);
            }
        } catch (error) {
            console.error('加载设定文件失败:', error);
            settings = createDefaultProjectSettings();
            new Notice('设定文件加载失败，已创建新的设定');
        }

        // 更新缓存和状态
        this.settingsCache.set(projectPath, settings);
        this.currentProjectPath = projectPath;
        this.stateManager.setProjectSettings(settings);

        return settings;
    }

    /**
     * 保存项目设定
     * @param projectPath 项目文件夹路径（可选，默认使用当前项目）
     */
    async saveSettings(projectPath?: string): Promise<void> {
        const targetPath = projectPath ?? this.currentProjectPath;
        if (targetPath === null) {
            console.warn('没有活动的项目，无法保存设定');
            return;
        }

        const settings = this.settingsCache.get(targetPath);
        if (!settings) {
            console.warn('没有找到对应的设定数据');
            return;
        }

        settings.updatedAt = new Date().toISOString();

        const settingsFilePath = this.getSettingsFilePath(targetPath);
        await this.ensureSettingsDir(targetPath);
        await this.saveSettingsToFile(settingsFilePath, settings);

        this.eventBus.emit('settings:changed', { settings, projectPath: targetPath });
    }

    /**
     * 获取当前项目设定
     * @returns 当前项目设定，如果没有活动项目返回 null
     */
    getCurrentSettings(): ProjectSettings | null {
        if (this.currentProjectPath === null) {
            return null;
        }
        return this.settingsCache.get(this.currentProjectPath) || null;
    }

    /**
     * 获取当前项目路径
     * @returns 当前活动的项目文件夹路径
     */
    getCurrentProjectPath(): string | null {
        return this.currentProjectPath;
    }

    /**
     * 检查当前是否在项目中
     * @returns 是否在项目中
     */
    isInProject(): boolean {
        return this.currentProjectPath !== null;
    }

    /**
     * 更新设定字段
     * @param field 字段名
     * @param value 字段值
     */
    async updateField<K extends keyof ProjectSettings>(
        field: K,
        value: ProjectSettings[K]
    ): Promise<void> {
        if (this.currentProjectPath === null) {
            new Notice('请先创建或打开一个剧本项目');
            return;
        }

        const settings = this.settingsCache.get(this.currentProjectPath);
        if (!settings) {
            return;
        }

        settings[field] = value;
        settings.updatedAt = new Date().toISOString();

        this.stateManager.setProjectSettings({ ...settings });
        await this.saveSettings();
    }

    /**
     * 获取角色列表
     * @returns 角色列表
     */
    getCharacters(): Character[] {
        const settings = this.getCurrentSettings();
        return settings?.characters || [];
    }

    /**
     * 添加角色
     * @param character 角色信息
     */
    async addCharacter(character: Character): Promise<void> {
        if (this.currentProjectPath === null) {
            console.warn('没有活动的项目');
            new Notice('请先创建或打开一个剧本项目');
            return;
        }

        const settings = this.settingsCache.get(this.currentProjectPath);
        if (!settings) {
            return;
        }

        const exists = settings.characters.some(c => c.name === character.name);
        if (exists) {
            new Notice(`角色 "${character.name}" 已存在`);
            return;
        }

        const newCharacter: Character = {
            ...character,
            id: character.id || this.generateId()
        };

        settings.characters.push(newCharacter);
        settings.updatedAt = new Date().toISOString();

        this.stateManager.setProjectSettings({ ...settings });
        await this.saveSettings();

        this.eventBus.emit('character:added', { character: newCharacter });
        new Notice(`已添加角色: ${newCharacter.name}`);
    }

    /**
     * 更新角色
     * @param characterId 角色 ID
     * @param updates 更新内容
     */
    async updateCharacter(
        characterId: string,
        updates: Partial<Omit<Character, 'id'>>
    ): Promise<void> {
        if (this.currentProjectPath === null) {
            return;
        }

        const settings = this.settingsCache.get(this.currentProjectPath);
        if (!settings) {
            return;
        }

        const index = settings.characters.findIndex(c => c.id === characterId);
        if (index === -1) {
            console.warn('角色不存在:', characterId);
            return;
        }

        settings.characters[index] = {
            ...settings.characters[index],
            ...updates
        };
        settings.updatedAt = new Date().toISOString();

        this.stateManager.setProjectSettings({ ...settings });
        await this.saveSettings();
    }

    /**
     * 删除角色
     * @param characterId 角色 ID
     */
    async removeCharacter(characterId: string): Promise<void> {
        if (this.currentProjectPath === null) {
            return;
        }

        const settings = this.settingsCache.get(this.currentProjectPath);
        if (!settings) {
            return;
        }

        const index = settings.characters.findIndex(c => c.id === characterId);
        if (index === -1) {
            return;
        }

        const removedName = settings.characters[index].name;
        settings.characters.splice(index, 1);
        settings.updatedAt = new Date().toISOString();

        this.stateManager.setProjectSettings({ ...settings });
        await this.saveSettings();

        new Notice(`已删除角色: ${removedName}`);
    }

    /**
     * 添加最近使用的地点
     * @param location 地点名称
     */
    async addRecentLocation(location: string): Promise<void> {
        if (this.currentProjectPath === null || !location.trim()) {
            return;
        }

        const settings = this.settingsCache.get(this.currentProjectPath);
        if (!settings) {
            return;
        }

        const existingIndex = settings.recentLocations.indexOf(location);
        if (existingIndex !== -1) {
            settings.recentLocations.splice(existingIndex, 1);
        }

        settings.recentLocations.unshift(location);

        if (settings.recentLocations.length > MAX_RECENT_LOCATIONS) {
            settings.recentLocations = settings.recentLocations.slice(0, MAX_RECENT_LOCATIONS);
        }

        settings.updatedAt = new Date().toISOString();

        this.stateManager.setProjectSettings({ ...settings });
        await this.saveSettings();
    }

    /**
     * 备份设定
     * @param projectPath 项目文件夹路径（可选，默认使用当前项目）
     */
    async backupSettings(projectPath?: string): Promise<void> {
        const targetPath = projectPath ?? this.currentProjectPath;
        if (targetPath === null) {
            new Notice('没有活动的项目');
            return;
        }

        const settings = this.settingsCache.get(targetPath);
        if (!settings) {
            new Notice('没有找到设定数据');
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `settings.backup-${timestamp}.json`;
        const backupPath = targetPath 
            ? `${targetPath}/${PROJECT_SETTINGS_DIR}/${backupFileName}`
            : `${PROJECT_SETTINGS_DIR}/${backupFileName}`;

        try {
            await this.app.vault.create(backupPath, JSON.stringify(settings, null, 2));
            new Notice('设定备份成功');
        } catch (error) {
            console.error('备份设定失败:', error);
            new Notice('备份设定失败');
        }
    }

    /**
     * 清除缓存
     * @param projectPath 指定项目路径（可选，不指定则清除所有）
     */
    clearCache(projectPath?: string): void {
        if (projectPath !== undefined) {
            this.settingsCache.delete(projectPath);
        } else {
            this.settingsCache.clear();
        }
    }

    /**
     * 切换当前文件
     * 当用户切换到不同的文件时调用，自动检测所属项目
     * @param filePath 新的文件路径
     */
    async switchFile(filePath: string | null): Promise<void> {
        if (!filePath) {
            this.currentProjectPath = null;
            this.stateManager.setProjectSettings(null);
            return;
        }

        // 只处理 .md 文件
        if (!filePath.endsWith('.md')) {
            return;
        }

        // 查找文件所属的项目
        const projectPath = this.findProjectFolder(filePath);
        
        if (projectPath === null) {
            // 文件不在任何项目中
            this.currentProjectPath = null;
            this.stateManager.setProjectSettings(null);
            return;
        }

        // 如果是同一个项目，不需要重新加载
        if (projectPath === this.currentProjectPath) {
            return;
        }

        // 加载新项目的设定
        await this.loadSettings(projectPath);
    }

    /**
     * 获取所有项目列表
     * 扫描 vault 中所有包含 .scriptnote 目录的文件夹
     * @returns 项目文件夹路径列表
     */
    async getAllProjects(): Promise<string[]> {
        const projects: string[] = [];
        
        // 检查根目录
        const rootSettingsDir = this.app.vault.getAbstractFileByPath(PROJECT_SETTINGS_DIR);
        if (rootSettingsDir instanceof TFolder) {
            projects.push('');
        }

        // 递归查找所有包含 .scriptnote 的文件夹
        const allFolders = this.app.vault.getAllLoadedFiles()
            .filter(f => f instanceof TFolder) as TFolder[];
        
        for (const folder of allFolders) {
            if (folder.name === PROJECT_SETTINGS_DIR) {
                // 找到设定目录，其父目录就是项目目录
                const parentPath = folder.parent?.path || '';
                if (!projects.includes(parentPath)) {
                    projects.push(parentPath);
                }
            }
        }

        return projects.sort();
    }

    // ==================== 私有方法 ====================

    /**
     * 获取设定文件路径
     * @param projectPath 项目文件夹路径
     * @returns 设定文件完整路径
     */
    private getSettingsFilePath(projectPath: string): string {
        return projectPath 
            ? `${projectPath}/${PROJECT_SETTINGS_DIR}/${PROJECT_SETTINGS_FILE}`
            : `${PROJECT_SETTINGS_DIR}/${PROJECT_SETTINGS_FILE}`;
    }

    /**
     * 确保设定目录存在
     * @param projectPath 项目文件夹路径
     */
    private async ensureSettingsDir(projectPath: string): Promise<void> {
        const settingsDirPath = projectPath 
            ? `${projectPath}/${PROJECT_SETTINGS_DIR}`
            : PROJECT_SETTINGS_DIR;
        
        const existingDir = this.app.vault.getAbstractFileByPath(settingsDirPath);
        if (!existingDir) {
            try {
                await this.app.vault.createFolder(settingsDirPath);
            } catch (error) {
                // 忽略"文件夹已存在"错误（可能是并发创建导致）
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (!errorMessage.includes('already exists') && !errorMessage.includes('已存在')) {
                    throw error;
                }
            }
        }
    }

    /**
     * 保存设定到文件
     * @param path 文件路径
     * @param settings 设定数据
     */
    private async saveSettingsToFile(path: string, settings: ProjectSettings): Promise<void> {
        const content = JSON.stringify(settings, null, 2);
        
        const existingFile = this.app.vault.getAbstractFileByPath(path);

        if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, content);
        } else if (existingFile) {
            // 文件存在但不是 TFile（可能是文件夹或其他类型）
            throw new Error(`路径 ${path} 存在但不是文件`);
        } else {
            // 文件不存在，创建新文件
            try {
                await this.app.vault.create(path, content);
            } catch (createError) {
                // 如果创建失败（可能是并发创建导致文件已存在），尝试修改
                const errorMessage = createError instanceof Error ? createError.message : String(createError);
                if (errorMessage.toLowerCase().includes('exist')) {
                    // 重新获取文件并修改
                    const retryFile = this.app.vault.getAbstractFileByPath(path);
                    if (retryFile instanceof TFile) {
                        await this.app.vault.modify(retryFile, content);
                    } else {
                        throw createError;
                    }
                } else {
                    throw createError;
                }
            }
        }
    }

    /**
     * 迁移旧版本设定
     * @param settings 原始设定
     * @returns 迁移后的设定
     */
    private migrateSettings(settings: ProjectSettings): ProjectSettings {
        const migrated: ProjectSettings = {
            version: settings.version || SETTINGS_VERSION,
            title: settings.title || '',
            synopsis: settings.synopsis || '',
            characters: settings.characters || [],
            outline: settings.outline || '',
            customTimePresets: settings.customTimePresets || [],
            customLocationPresets: settings.customLocationPresets || [],
            recentLocations: settings.recentLocations || [],
            createdAt: settings.createdAt || new Date().toISOString(),
            updatedAt: settings.updatedAt || new Date().toISOString(),
            scriptFile: settings.scriptFile || '',
            settingsFile: settings.settingsFile || ''
        };

        migrated.characters = migrated.characters.map(char => ({
            id: char.id || this.generateId(),
            name: char.name || '',
            description: char.description || '',
            traits: char.traits || []
        }));

        return migrated;
    }

    /**
     * 生成唯一 ID
     * @returns 唯一 ID 字符串
     */
    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
