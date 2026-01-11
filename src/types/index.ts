/**
 * ScriptNote - 类型定义
 * 包含所有核心接口和类型
 */

// ==================== 事件类型 ====================

/**
 * 事件总线支持的事件类型
 */
export type EventType =
    | 'scene:inserted'      // 场景插入
    | 'scene:renumbered'    // 场景重新编号
    | 'character:added'     // 角色添加
    | 'settings:changed'    // 设定变更
    | 'document:changed';   // 文档变更

/**
 * 事件处理函数类型
 */
export type EventHandler<T = unknown> = (data: T) => void;

// ==================== 场景相关类型 ====================

/**
 * 场景编号
 */
export interface SceneNumber {
    episode: number;  // 集数
    scene: number;    // 场数
}

/**
 * 场景信息
 */
export interface SceneInfo {
    episode: number;       // 集数
    scene: number;         // 场数
    line: number;          // 所在行号
    time: string;          // 时间（日/夜等）
    locationType: string;  // 内/外
    location: string;      // 地点名称
    characters: string[];  // 出场人物
    tags: string[];        // 场景标签
    wordCount: number;     // 字数
    isFlashback: boolean;  // 是否在闪回中
}

/**
 * 场景索引
 */
export interface SceneIndex {
    scenes: SceneInfo[];    // 所有场景
    episodeCount: number;   // 集数
    lastUpdated: number;    // 最后更新时间戳
    contentHash: string;    // 内容哈希，用于增量更新判断
}

/**
 * 场景头验证结果
 */
export interface ValidationResult {
    valid: boolean;         // 是否有效
    errors: ValidationError[];  // 错误列表
}

/**
 * 验证错误
 */
export interface ValidationError {
    position: number;       // 错误位置
    message: string;        // 错误消息
}

// ==================== 角色相关类型 ====================

/**
 * 角色信息
 */
export interface Character {
    id: string;             // 唯一标识
    name: string;           // 角色名
    description: string;    // 角色描述
    traits: string[];       // 性格特点
}

/**
 * 角色统计
 */
export interface CharacterStats {
    name: string;           // 角色名
    sceneCount: number;     // 出场场次
    dialogueCount: number;  // 台词条数
    dialogueWordCount: number;  // 台词字数
    scenes: number[];       // 出场场景列表（场景行号）
}

// ==================== 设定相关类型 ====================

/**
 * 项目级设定
 */
export interface ProjectSettings {
    version: string;                    // 设置版本号
    title: string;                      // 剧名
    synopsis: string;                   // 故事梗概
    characters: Character[];            // 人物列表
    outline: string;                    // 大纲
    customTimePresets: string[];        // 自定义时间预设
    customLocationPresets: string[];    // 自定义地点预设
    recentLocations: string[];          // 最近使用的地点
    createdAt: string;                  // 创建时间 ISO 8601
    updatedAt: string;                  // 更新时间 ISO 8601
    scriptFile: string;                 // 剧本文件路径（用于统计）
    settingsFile: string;               // 设定文件路径（md 格式）
}

/**
 * 全局插件设置
 */
export interface GlobalSettings {
    // 剧本项目列表（支持多个项目）
    screenplayProjects: string[];       // 剧本项目文件夹路径列表

    // 功能开关
    autoInsertTriangle: boolean;        // 自动插入 △
    enableCharacterPopup: boolean;      // 启用 / 角色选择

    // 修饰符选择快捷键配置
    modifierHotkey: {
        key: string;        // 主键（如 'Tab'）
        altKey: boolean;    // 是否需要 Alt/Option
        ctrlKey: boolean;   // 是否需要 Ctrl
        shiftKey: boolean;  // 是否需要 Shift
        metaKey: boolean;   // 是否需要 Meta/Cmd
    };

    // 默认预设配置
    defaultTimePresets: string[];       // 默认时间预设
    defaultTagPresets: string[];        // 默认标签预设
    defaultLocationPresets: string[];   // 默认地点预设

    // AI 配置
    aiApiKey: string;
    aiEndpoint: string;
    aiModel: string;

    // 导出配置
    defaultExportTemplate: string;      // 默认导出模板
    wordExportFont: string;             // Word 导出字体
    pdfExportFont: string;              // PDF 导出字体
    exportIncludeSettings: boolean;     // 导出时包含设定信息
    breakdownIncludeDuration: boolean;  // 分场表包含时长估算

    // Word 导出格式设置
    exportFormat: ExportFormatSettings; // 导出格式设置

    // 面板状态
    panelOpen: boolean;
}

/**
 * 导出格式设置
 */
export interface ExportFormatSettings {
    // 集标题格式
    episodeTitle: {
        font: string;       // 字体
        size: number;       // 字号（pt）
        bold: boolean;      // 是否加粗
        center: boolean;    // 是否居中
    };
    // 场景头格式
    sceneHeader: {
        font: string;
        size: number;
        bold: boolean;
    };
    // 正文/台词格式
    body: {
        font: string;
        size: number;
    };
    // 角色名格式
    characterName: {
        font: string;
        size: number;
        bold: boolean;
    };
    // 动作描述格式
    action: {
        font: string;
        size: number;
    };
}

// ==================== 统计相关类型 ====================

/**
 * 每集统计
 */
export interface EpisodeStats {
    episode: number;            // 集数
    wordCount: number;          // 字数
    sceneCount: number;         // 场景数
    estimatedDuration: number;  // 预估时长（分钟）
}

// ==================== 状态管理类型 ====================

/**
 * 应用状态
 */
export interface AppState {
    sceneIndex: SceneIndex;
    projectSettings: ProjectSettings | null;
    stats: {
        episodeStats: EpisodeStats[];
        characterStats: CharacterStats[];
    };
    ui: {
        panelOpen: boolean;
        activeSection: string;
    };
}

/**
 * 状态监听器
 */
export type StateListener = (state: AppState) => void;

// ==================== 导出相关类型 ====================

/**
 * 导出选项
 */
export interface ExportOptions {
    includeSettings: boolean;
    template?: string;
}

/**
 * 导出器接口
 */
export interface Exporter {
    name: string;           // 导出器名称
    extension: string;      // 文件扩展名
    mimeType: string;       // MIME 类型
    export(
        content: string,
        index: SceneIndex,
        settings: ProjectSettings,
        options: ExportOptions
    ): Promise<Blob>;
}

// ==================== AI 相关类型 ====================

/**
 * AI 配置
 */
export interface AIConfig {
    apiKey: string;
    endpoint: string;
    model: string;
}

/**
 * AI 生成请求
 */
export interface GenerationRequest {
    type: 'synopsis' | 'character' | 'outline';
    context: string;
    prompt?: string;
}

// ==================== 弹窗相关类型 ====================

/**
 * 角色选择弹窗项
 */
export interface PopupItem {
    id: string;
    name: string;
    type: 'normal' | 'phone' | 'voiceover';
}

// ==================== 错误消息类型 ====================

/**
 * 错误消息
 */
export interface ErrorMessage {
    code: string;           // 错误代码
    message: string;        // 用户友好的错误消息（中文）
    suggestion?: string;    // 修复建议
}
