/**
 * ScriptNote - 短剧剧本写作插件 - 常量定义
 */

// ==================== 正则表达式 ====================

/**
 * 场景编号格式：集数-场数
 */
export const SCENE_NUMBER_REGEX = /^(\d+)-(\d+)/;

/**
 * 完整场景头格式：编号 时间 内外景 地点
 */
export const SCENE_HEADER_REGEX = /^(\d+)-(\d+)\s+(日|夜|雨夜|雪夜|\S+)\s+(内|外)\s+(.+)$/;

/**
 * 出场人物格式：人 角色1 角色2 ...
 */
export const CHARACTER_LIST_REGEX = /^人\s+(.+)$/;

/**
 * 台词格式：角色名（情绪）：台词
 */
export const DIALOGUE_REGEX = /^(.+?)（(.+?)）：(.+)$/;

/**
 * 简单台词格式：角色名：台词
 */
export const SIMPLE_DIALOGUE_REGEX = /^(.+?)：(.+)$/;

/**
 * 动作描述格式：△ 内容
 */
export const ACTION_REGEX = /^△\s*(.*)$/;

/**
 * 场景标签格式：【标签：xxx】
 */
export const TAG_REGEX = /【标签：(.+?)】/g;

// ==================== 闪回标记 ====================

export const FLASHBACK_START = '【闪回】';
export const FLASHBACK_END = '【闪回结束】';

// ==================== 默认设置 ====================

/**
 * 默认时间预设
 */
export const DEFAULT_TIME_PRESETS = ['日', '夜', '雨夜', '雪夜'];

/**
 * 默认标签预设
 */
export const DEFAULT_TAG_PRESETS = ['动作戏', '感情戏', '转折点', '高潮'];

/**
 * 默认地点预设
 */
export const DEFAULT_LOCATION_PRESETS = ['客厅', '卧室', '办公室', '街道', '咖啡馆', '餐厅'];

/**
 * 默认地点类型
 */
export const LOCATION_TYPES = ['内', '外'];

// ==================== 视图类型 ====================

export const SIDE_PANEL_VIEW_TYPE = 'screenplay-side-panel';

// ==================== 错误消息 ====================

export const ERROR_MESSAGES = {
    SCENE_HEADER_INVALID: {
        code: 'E001',
        message: '场景头格式不正确',
        suggestion: '正确格式：编号 时间 内外景 地点（如：1-1 日 内 咖啡馆）'
    },
    SETTINGS_LOAD_FAILED: {
        code: 'E002',
        message: '设定文件加载失败',
        suggestion: '将尝试从备份恢复，或创建新的设定文件'
    },
    AI_SERVICE_UNAVAILABLE: {
        code: 'E003',
        message: 'AI 服务暂时不可用',
        suggestion: '请检查网络连接和 API 配置，或手动输入内容'
    },
    EXPORT_FAILED: {
        code: 'E004',
        message: '导出失败',
        suggestion: '请检查文件权限，或尝试导出到其他位置'
    },
    NO_CHARACTERS_DEFINED: {
        code: 'E005',
        message: '尚未定义角色',
        suggestion: '请在设定面板中添加角色'
    }
};

// ==================== 统计常量 ====================

/**
 * 每分钟字数（用于时长估算）
 */
export const WORDS_PER_MINUTE = 200;

/**
 * 最近使用地点最大数量
 */
export const MAX_RECENT_LOCATIONS = 10;

// ==================== 设定文件 ====================

/**
 * 设定文件版本
 */
export const SETTINGS_VERSION = '1.0';

/**
 * 设定文件后缀（已废弃，保留用于迁移）
 */
export const SETTINGS_FILE_SUFFIX = '.screenplay-settings.json';

/**
 * 项目设定目录名
 */
export const PROJECT_SETTINGS_DIR = '.scriptnote';

/**
 * 项目设定文件名
 */
export const PROJECT_SETTINGS_FILE = 'settings.json';
