/**
 * ScriptNote - 场景服务
 * 负责场景解析、编号管理和场景头验证
 */

import { Editor } from 'obsidian';
import {
    SceneInfo,
    SceneIndex,
    SceneNumber,
    ValidationResult,
    ValidationError
} from '../types';
import {
    SCENE_NUMBER_REGEX,
    SCENE_HEADER_REGEX,
    CHARACTER_LIST_REGEX,
    TAG_REGEX,
    FLASHBACK_START,
    FLASHBACK_END,
    LOCATION_TYPES
} from '../utils/constants';
import { EventBus } from './EventBus';

/**
 * 场景头解析结果
 */
export interface ParsedSceneHeader {
    episode: number;       // 集数
    scene: number;         // 场数
    time: string;          // 时间
    locationType: string;  // 内/外
    location: string;      // 地点
}

/**
 * 解析场景头
 * @param line 场景头行文本
 * @returns 解析结果，如果格式不正确返回 null
 */
export function parseSceneHeader(line: string): ParsedSceneHeader | null {
    const trimmedLine = line.trim();
    const match = trimmedLine.match(SCENE_HEADER_REGEX);
    
    if (!match) {
        return null;
    }

    return {
        episode: parseInt(match[1], 10),
        scene: parseInt(match[2], 10),
        time: match[3],
        locationType: match[4],
        location: match[5].trim()
    };
}

/**
 * 验证场景头格式
 * @param line 场景头行文本
 * @returns 验证结果
 */
export function validateSceneHeader(line: string): ValidationResult {
    const errors: ValidationError[] = [];
    const trimmedLine = line.trim();

    // 空行检查
    if (!trimmedLine) {
        return {
            valid: false,
            errors: [{
                position: 0,
                message: '场景头不能为空'
            }]
        };
    }

    // 检查场景编号
    const numberMatch = trimmedLine.match(SCENE_NUMBER_REGEX);
    if (!numberMatch) {
        errors.push({
            position: 0,
            message: '缺少有效的场景编号（格式：集数-场数，如 1-1）'
        });
        // 如果没有编号，无法继续解析
        return { valid: false, errors };
    }

    // 获取编号后的部分
    const afterNumber = trimmedLine.substring(numberMatch[0].length).trim();
    const numberEndPos = numberMatch[0].length;

    if (!afterNumber) {
        errors.push({
            position: numberEndPos,
            message: '缺少时间、内外景和地点信息'
        });
        return { valid: false, errors };
    }

    // 分割剩余部分
    const parts = afterNumber.split(/\s+/);

    // 检查时间
    if (parts.length < 1 || !parts[0]) {
        errors.push({
            position: numberEndPos,
            message: '缺少时间信息（如：日、夜、雨夜、雪夜）'
        });
    }

    // 检查内外景
    if (parts.length < 2) {
        errors.push({
            position: numberEndPos + (parts[0]?.length || 0) + 1,
            message: '缺少内外景信息（内 或 外）'
        });
    } else if (!LOCATION_TYPES.includes(parts[1])) {
        const timeLength = parts[0]?.length || 0;
        errors.push({
            position: numberEndPos + timeLength + 1,
            message: `内外景必须是"内"或"外"，当前值："${parts[1]}"`
        });
    }

    // 检查地点
    if (parts.length < 3) {
        errors.push({
            position: trimmedLine.length,
            message: '缺少地点信息'
        });
    }

    // 如果有错误，返回无效
    if (errors.length > 0) {
        return { valid: false, errors };
    }

    // 完整格式验证
    const fullMatch = trimmedLine.match(SCENE_HEADER_REGEX);
    if (!fullMatch) {
        errors.push({
            position: 0,
            message: '场景头格式不正确，正确格式：编号 时间 内外景 地点（如：1-1 日 内 咖啡馆）'
        });
        return { valid: false, errors };
    }

    return { valid: true, errors: [] };
}

/**
 * 检查行是否是场景编号行（只检查是否以场景编号开头）
 * @param line 行文本
 * @returns 是否是场景编号行
 */
export function isSceneNumberLine(line: string): boolean {
    return SCENE_NUMBER_REGEX.test(line.trim());
}

/**
 * 从行中提取场景编号
 * @param line 行文本
 * @returns 场景编号，如果不是场景行返回 null
 */
export function extractSceneNumber(line: string): SceneNumber | null {
    const match = line.trim().match(SCENE_NUMBER_REGEX);
    if (!match) {
        return null;
    }
    return {
        episode: parseInt(match[1], 10),
        scene: parseInt(match[2], 10)
    };
}

/**
 * 解析出场人物行
 * @param line 行文本
 * @returns 角色名数组，如果不是人物行返回 null
 */
export function parseCharacterList(line: string): string[] | null {
    const match = line.trim().match(CHARACTER_LIST_REGEX);
    if (!match) {
        return null;
    }
    // 按空格分割角色名
    return match[1].split(/\s+/).filter(name => name.length > 0);
}

/**
 * 解析场景标签
 * @param text 文本内容
 * @returns 标签数组
 */
export function parseSceneTags(text: string): string[] {
    const tags: string[] = [];
    let match;
    
    // 重置正则表达式的 lastIndex
    const regex = new RegExp(TAG_REGEX.source, 'g');
    
    while ((match = regex.exec(text)) !== null) {
        tags.push(match[1]);
    }
    
    return tags;
}

/**
 * 格式化场景编号为字符串
 * @param sceneNumber 场景编号
 * @returns 格式化的字符串（如 "1-1"）
 */
export function formatSceneNumber(sceneNumber: SceneNumber): string {
    return `${sceneNumber.episode}-${sceneNumber.scene}`;
}


/**
 * 计算文本字数（中文字符计为1，英文单词计为1）
 * @param text 文本内容
 * @returns 字数
 */
function countWords(text: string): number {
    // 移除空白字符
    const cleanText = text.replace(/\s+/g, '');
    // 简单计算：每个字符计为1（主要针对中文）
    return cleanText.length;
}

/**
 * 计算内容哈希（简单实现）
 * @param content 内容
 * @returns 哈希字符串
 */
function calculateHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(16);
}

/**
 * 场景服务类
 * 负责场景解析、编号管理和文档索引
 */
export class SceneService {
    /** 场景索引 */
    private index: SceneIndex;
    
    /** 事件总线 */
    private eventBus: EventBus;

    /**
     * 构造函数
     * @param eventBus 事件总线实例
     */
    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.index = this.createEmptyIndex();
    }

    /**
     * 创建空的场景索引
     */
    private createEmptyIndex(): SceneIndex {
        return {
            scenes: [],
            episodeCount: 0,
            lastUpdated: Date.now(),
            contentHash: ''
        };
    }

    /**
     * 获取当前场景索引
     * @returns 场景索引
     */
    getIndex(): SceneIndex {
        return this.index;
    }

    /**
     * 解析文档构建场景索引
     * @param content 文档内容
     * @param previousIndex 之前的索引（用于增量更新判断）
     * @returns 场景索引
     */
    parseDocument(content: string, previousIndex?: SceneIndex): SceneIndex {
        const contentHash = calculateHash(content);
        
        // 如果内容没有变化，直接返回之前的索引
        if (previousIndex && previousIndex.contentHash === contentHash) {
            return previousIndex;
        }

        const lines = content.split('\n');
        const scenes: SceneInfo[] = [];
        let inFlashback = false;
        let currentSceneStartLine = -1;
        let currentSceneContent: string[] = [];
        let currentTags: string[] = [];
        let maxEpisode = 0;

        // 遍历所有行
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const trimmedLine = line.trim();

            // 检查闪回标记
            if (trimmedLine === FLASHBACK_START) {
                inFlashback = true;
                continue;
            }
            if (trimmedLine === FLASHBACK_END) {
                inFlashback = false;
                continue;
            }

            // 尝试解析场景头
            const parsedHeader = parseSceneHeader(trimmedLine);
            
            if (parsedHeader) {
                // 如果有之前的场景，先保存它
                if (currentSceneStartLine >= 0 && scenes.length > 0) {
                    const lastScene = scenes[scenes.length - 1];
                    lastScene.wordCount = countWords(currentSceneContent.join('\n'));
                    lastScene.tags = currentTags;
                }

                // 创建新场景
                const sceneInfo: SceneInfo = {
                    episode: parsedHeader.episode,
                    scene: parsedHeader.scene,
                    line: lineIndex,
                    time: parsedHeader.time,
                    locationType: parsedHeader.locationType,
                    location: parsedHeader.location,
                    characters: [],
                    tags: [],
                    wordCount: 0,
                    isFlashback: inFlashback
                };

                scenes.push(sceneInfo);
                currentSceneStartLine = lineIndex;
                currentSceneContent = [];
                currentTags = [];

                // 更新最大集数
                if (parsedHeader.episode > maxEpisode) {
                    maxEpisode = parsedHeader.episode;
                }
                continue;
            }

            // 如果当前在场景中
            if (currentSceneStartLine >= 0) {
                // 尝试解析出场人物
                const characters = parseCharacterList(trimmedLine);
                if (characters) {
                    if (scenes.length > 0) {
                        scenes[scenes.length - 1].characters = characters;
                    }
                    continue;
                }

                // 解析标签
                const tags = parseSceneTags(trimmedLine);
                if (tags.length > 0) {
                    currentTags.push(...tags);
                }

                // 累积场景内容（用于字数统计）
                currentSceneContent.push(line);
            }
        }

        // 处理最后一个场景
        if (scenes.length > 0 && currentSceneContent.length > 0) {
            const lastScene = scenes[scenes.length - 1];
            lastScene.wordCount = countWords(currentSceneContent.join('\n'));
            lastScene.tags = currentTags;
        }

        // 构建索引
        this.index = {
            scenes,
            episodeCount: maxEpisode,
            lastUpdated: Date.now(),
            contentHash
        };

        return this.index;
    }

    /**
     * 根据光标位置计算下一个场景编号
     * 处理以下情况：
     * - 空文档：返回 1-1
     * - 光标在所有场景之前：返回第一集的第1场
     * - 光标在某集末尾：返回该集的下一个场号
     * - 光标在两个场景之间：返回正确的插入位置编号
     * - 光标在不同集之间：插入到前一集的末尾
     * 
     * @param cursorLine 光标所在行号
     * @returns 下一个场景编号
     */
    getNextSceneNumber(cursorLine: number): SceneNumber {
        const scenes = this.index.scenes;

        // 空文档，返回 1-1
        if (scenes.length === 0) {
            return { episode: 1, scene: 1 };
        }

        // 找到光标位置之前和之后的场景
        let prevScene: SceneInfo | null = null;
        let nextScene: SceneInfo | null = null;

        for (let i = 0; i < scenes.length; i++) {
            if (scenes[i].line <= cursorLine) {
                prevScene = scenes[i];
            } else {
                nextScene = scenes[i];
                break;
            }
        }

        // 如果光标在所有场景之前
        if (!prevScene) {
            // 在第一个场景之前插入，使用第一个场景的集数
            const firstScene = scenes[0];
            return { episode: firstScene.episode, scene: 1 };
        }

        // 如果光标在所有场景之后（集末尾）
        if (!nextScene) {
            // 在最后一个场景之后插入，返回该集的下一个场号
            return { episode: prevScene.episode, scene: prevScene.scene + 1 };
        }

        // 光标在两个场景之间
        // 如果是同一集，插入中间编号（后续场景需要重新编号）
        if (prevScene.episode === nextScene.episode) {
            return { episode: prevScene.episode, scene: prevScene.scene + 1 };
        }

        // 不同集之间，插入到前一集的末尾
        return { episode: prevScene.episode, scene: prevScene.scene + 1 };
    }

    /**
     * 检查插入场景后是否需要重新编号后续场景
     * @param cursorLine 光标所在行号
     * @returns 是否需要重新编号
     */
    needsRenumbering(cursorLine: number): boolean {
        const scenes = this.index.scenes;
        
        if (scenes.length === 0) {
            return false;
        }

        // 找到光标位置之前和之后的场景
        let prevScene: SceneInfo | null = null;
        let nextScene: SceneInfo | null = null;

        for (const scene of scenes) {
            if (scene.line <= cursorLine) {
                prevScene = scene;
            } else {
                nextScene = scene;
                break;
            }
        }

        // 如果没有后续场景，不需要重新编号
        if (!nextScene) {
            return false;
        }

        // 如果前后场景是同一集，需要重新编号
        if (prevScene && prevScene.episode === nextScene.episode) {
            return true;
        }

        // 如果光标在所有场景之前，且第一个场景的场号是1，需要重新编号
        if (!prevScene && nextScene.scene === 1) {
            return true;
        }

        return false;
    }

    /**
     * 获取需要重新编号的场景列表
     * @param cursorLine 光标所在行号
     * @param newSceneNumber 新插入的场景编号
     * @returns 需要重新编号的场景信息数组
     */
    getScenesToRenumber(cursorLine: number, newSceneNumber: SceneNumber): SceneInfo[] {
        const scenes = this.index.scenes;
        const result: SceneInfo[] = [];

        for (const scene of scenes) {
            // 只处理同一集且在光标之后的场景
            if (scene.episode === newSceneNumber.episode && 
                scene.line > cursorLine &&
                scene.scene >= newSceneNumber.scene) {
                result.push(scene);
            }
        }

        return result;
    }

    /**
     * 生成场景头模板
     * @param sceneNumber 场景编号
     * @param time 时间（默认"日"）
     * @param locationType 内外景（默认"内"）
     * @param location 地点（默认"地点"）
     * @returns 场景头模板字符串
     */
    generateSceneHeaderTemplate(
        sceneNumber: SceneNumber,
        time: string = '日',
        locationType: string = '内',
        location: string = '地点'
    ): string {
        return `${sceneNumber.episode}-${sceneNumber.scene} ${time} ${locationType} ${location}`;
    }

    /**
     * 生成出场人物模板
     * @returns 出场人物模板字符串
     */
    generateCharacterListTemplate(): string {
        return '人物：';
    }

    /**
     * 生成完整的场景插入内容
     * @param sceneNumber 场景编号
     * @param time 时间
     * @param locationType 内外景
     * @param location 地点
     * @returns 完整的场景内容（包含场景头和人物行）
     */
    generateSceneContent(
        sceneNumber: SceneNumber,
        time: string = '日',
        locationType: string = '内',
        location: string = '地点'
    ): string {
        const header = this.generateSceneHeaderTemplate(sceneNumber, time, locationType, location);
        const characterList = this.generateCharacterListTemplate();
        return `${header}\n${characterList}\n`;
    }

    /**
     * 插入场景头
     * 使用 Editor Transaction 支持撤销
     * @param editor Obsidian 编辑器实例
     * @param sceneNumber 场景编号（可选，不提供则自动计算）
     * @param time 时间
     * @param locationType 内外景
     * @param location 地点
     */
    insertScene(
        editor: Editor,
        sceneNumber?: SceneNumber,
        time: string = '日',
        locationType: string = '内',
        location: string = '地点'
    ): void {
        const cursor = editor.getCursor();
        const cursorLine = cursor.line;

        // 如果没有提供场景编号，自动计算
        const actualSceneNumber = sceneNumber || this.getNextSceneNumber(cursorLine);

        // 检查是否需要重新编号
        const needsRenumber = this.needsRenumbering(cursorLine);
        const scenesToRenumber = needsRenumber 
            ? this.getScenesToRenumber(cursorLine, actualSceneNumber)
            : [];

        // 生成场景内容
        const sceneContent = this.generateSceneContent(
            actualSceneNumber,
            time,
            locationType,
            location
        );

        // 获取当前行内容，判断是否需要在新行插入
        const currentLineContent = editor.getLine(cursorLine);
        const insertAtNewLine = currentLineContent.trim().length > 0;

        // 计算插入位置
        const insertLine = cursorLine;
        let insertCh = 0;
        let prefix = '';

        if (insertAtNewLine) {
            // 在当前行末尾插入换行，然后插入场景
            insertCh = currentLineContent.length;
            prefix = '\n\n';
        } else {
            // 当前行为空，直接在当前位置插入
            insertCh = 0;
        }

        // 使用 transaction 进行原子操作
        const insertText = prefix + sceneContent;
        
        // 插入场景内容
        editor.replaceRange(
            insertText,
            { line: insertLine, ch: insertCh }
        );

        // 如果需要重新编号后续场景
        if (scenesToRenumber.length > 0) {
            // 计算插入内容后的行偏移
            const insertedLines = insertText.split('\n').length - 1;
            
            // 重新编号后续场景（从后往前处理，避免行号变化影响）
            this.renumberScenesInEditor(editor, scenesToRenumber, insertedLines);
        }

        // 计算场景头行号
        const sceneHeaderLine = insertAtNewLine ? insertLine + 2 : insertLine;
        
        // 计算"地点"在场景头中的位置
        // 格式：X-X 日 内 地点
        const header = this.generateSceneHeaderTemplate(actualSceneNumber, time, locationType, location);
        const locationStart = header.lastIndexOf(location);
        const locationEnd = locationStart + location.length;
        
        // 选中"地点"文字，方便用户直接修改
        editor.setSelection(
            { line: sceneHeaderLine, ch: locationStart },
            { line: sceneHeaderLine, ch: locationEnd }
        );

        // 发送事件
        this.eventBus.emit('scene:inserted', actualSceneNumber);
    }

    /**
     * 在编辑器中重新编号场景
     * @param editor 编辑器实例
     * @param scenes 需要重新编号的场景
     * @param lineOffset 行偏移量（因为插入了新内容）
     */
    private renumberScenesInEditor(
        editor: Editor,
        scenes: SceneInfo[],
        lineOffset: number
    ): void {
        // 从后往前处理，避免行号变化影响
        const sortedScenes = [...scenes].sort((a, b) => b.line - a.line);

        for (const scene of sortedScenes) {
            const actualLine = scene.line + lineOffset;
            const lineContent = editor.getLine(actualLine);
            
            // 提取场景编号部分并替换
            const match = lineContent.match(SCENE_NUMBER_REGEX);
            if (match) {
                const oldNumber = match[0];
                const newNumber = `${scene.episode}-${scene.scene + 1}`;
                const newLineContent = lineContent.replace(oldNumber, newNumber);
                
                // 替换整行
                editor.replaceRange(
                    newLineContent,
                    { line: actualLine, ch: 0 },
                    { line: actualLine, ch: lineContent.length }
                );
            }
        }

        // 发送重新编号事件
        this.eventBus.emit('scene:renumbered', { count: scenes.length });
    }

    /**
     * 插入新一集
     * @param editor Obsidian 编辑器实例
     */
    insertNewEpisode(editor: Editor): void {
        // 获取当前最大集数
        const maxEpisode = this.index.episodeCount || 0;
        const newEpisode = maxEpisode + 1;

        // 新一集从第1场开始
        const sceneNumber: SceneNumber = {
            episode: newEpisode,
            scene: 1
        };

        // 在文档末尾插入
        const lastLine = editor.lastLine();
        const lastLineContent = editor.getLine(lastLine);

        // 添加分隔和新集标记
        const separator = '\n\n---\n\n';
        const episodeMarker = `# 第${newEpisode}集\n\n`;
        const sceneContent = this.generateSceneContent(sceneNumber);

        const insertText = separator + episodeMarker + sceneContent;

        // 在文档末尾插入
        editor.replaceRange(
            insertText,
            { line: lastLine, ch: lastLineContent.length }
        );

        // 移动光标到新场景的人物行
        const newCursorLine = lastLine + 6; // separator(4) + marker(2) + header(1) = 7 lines, cursor at line 6 (0-indexed)
        editor.setCursor({ line: newCursorLine, ch: 2 });

        // 发送事件
        this.eventBus.emit('scene:inserted', sceneNumber);
    }

    /**
     * 插入闪回标记
     * 在当前光标位置插入【闪回】标记，并自动插入一个新场景
     * 闪回内的场景编号保持连续
     * @param editor Obsidian 编辑器实例
     */
    insertFlashback(editor: Editor): void {
        const cursor = editor.getCursor();
        const cursorLine = cursor.line;
        const currentLineContent = editor.getLine(cursorLine);

        // 计算下一个场景编号（闪回内场景编号保持连续）
        const nextSceneNumber = this.getNextSceneNumber(cursorLine);

        // 生成闪回内容：闪回标记 + 场景头 + 人物行
        const sceneContent = this.generateSceneContent(nextSceneNumber);
        
        // 判断是否需要在新行插入
        const insertAtNewLine = currentLineContent.trim().length > 0;
        
        let insertText: string;
        let insertCh: number;
        
        if (insertAtNewLine) {
            // 在当前行末尾插入换行，然后插入闪回
            insertCh = currentLineContent.length;
            insertText = `\n\n${FLASHBACK_START}\n${sceneContent}`;
        } else {
            // 当前行为空，直接在当前位置插入
            insertCh = 0;
            insertText = `${FLASHBACK_START}\n${sceneContent}`;
        }

        // 检查是否需要重新编号后续场景
        const needsRenumber = this.needsRenumbering(cursorLine);
        const scenesToRenumber = needsRenumber 
            ? this.getScenesToRenumber(cursorLine, nextSceneNumber)
            : [];

        // 插入闪回内容
        editor.replaceRange(
            insertText,
            { line: cursorLine, ch: insertCh }
        );

        // 如果需要重新编号后续场景
        if (scenesToRenumber.length > 0) {
            // 计算插入内容后的行偏移
            const insertedLines = insertText.split('\n').length - 1;
            
            // 重新编号后续场景
            this.renumberScenesInEditor(editor, scenesToRenumber, insertedLines);
        }

        // 移动光标到人物行末尾
        const newCursorLine = insertAtNewLine ? cursorLine + 4 : cursorLine + 2;
        editor.setCursor({ line: newCursorLine, ch: 2 });

        // 发送事件
        this.eventBus.emit('scene:inserted', nextSceneNumber);
    }

    /**
     * 插入闪回结束标记
     * 在当前光标位置插入【闪回结束】标记
     * @param editor Obsidian 编辑器实例
     */
    insertFlashbackEnd(editor: Editor): void {
        const cursor = editor.getCursor();
        const cursorLine = cursor.line;
        const currentLineContent = editor.getLine(cursorLine);

        // 判断是否需要在新行插入
        const insertAtNewLine = currentLineContent.trim().length > 0;
        
        let insertText: string;
        let insertCh: number;
        
        if (insertAtNewLine) {
            // 在当前行末尾插入换行，然后插入闪回结束标记
            insertCh = currentLineContent.length;
            insertText = `\n\n${FLASHBACK_END}\n`;
        } else {
            // 当前行为空，直接在当前位置插入
            insertCh = 0;
            insertText = `${FLASHBACK_END}\n`;
        }

        // 插入闪回结束标记
        editor.replaceRange(
            insertText,
            { line: cursorLine, ch: insertCh }
        );

        // 移动光标到闪回结束标记后的新行
        const newCursorLine = insertAtNewLine ? cursorLine + 3 : cursorLine + 1;
        editor.setCursor({ line: newCursorLine, ch: 0 });
    }

    /**
     * 插入闪回（同时包含开始和结束标记）
     * 在当前光标位置插入【闪回】标记、新场景和【闪回结束】标记
     * 闪回内的场景编号保持连续
     * @param editor Obsidian 编辑器实例
     */
    insertFlashbackWithEnd(editor: Editor): void {
        const cursor = editor.getCursor();
        const cursorLine = cursor.line;
        const currentLineContent = editor.getLine(cursorLine);

        // 计算下一个场景编号（闪回内场景编号保持连续）
        const nextSceneNumber = this.getNextSceneNumber(cursorLine);

        // 生成闪回内容：闪回标记 + 场景头 + 人物行 + 空行 + 闪回结束标记
        const sceneContent = this.generateSceneContent(nextSceneNumber);
        
        // 判断是否需要在新行插入
        const insertAtNewLine = currentLineContent.trim().length > 0;
        
        let insertText: string;
        let insertCh: number;
        
        if (insertAtNewLine) {
            // 在当前行末尾插入换行，然后插入闪回
            insertCh = currentLineContent.length;
            insertText = `\n\n${FLASHBACK_START}\n${sceneContent}\n${FLASHBACK_END}\n`;
        } else {
            // 当前行为空，直接在当前位置插入
            insertCh = 0;
            insertText = `${FLASHBACK_START}\n${sceneContent}\n${FLASHBACK_END}\n`;
        }

        // 检查是否需要重新编号后续场景
        const needsRenumber = this.needsRenumbering(cursorLine);
        const scenesToRenumber = needsRenumber 
            ? this.getScenesToRenumber(cursorLine, nextSceneNumber)
            : [];

        // 插入闪回内容
        editor.replaceRange(
            insertText,
            { line: cursorLine, ch: insertCh }
        );

        // 如果需要重新编号后续场景
        if (scenesToRenumber.length > 0) {
            // 计算插入内容后的行偏移
            const insertedLines = insertText.split('\n').length - 1;
            
            // 重新编号后续场景
            this.renumberScenesInEditor(editor, scenesToRenumber, insertedLines);
        }

        // 移动光标到人物行末尾（在闪回开始标记和闪回结束标记之间）
        const newCursorLine = insertAtNewLine ? cursorLine + 4 : cursorLine + 2;
        editor.setCursor({ line: newCursorLine, ch: 2 });

        // 发送事件
        this.eventBus.emit('scene:inserted', nextSceneNumber);
    }

    /**
     * 重新编号指定行之后的所有场景
     * @param editor 编辑器实例
     * @param fromLine 起始行号
     * @param episode 集数
     */
    renumberScenes(editor: Editor, fromLine: number, episode: number): void {
        const scenes = this.index.scenes.filter(
            s => s.episode === episode && s.line >= fromLine
        );

        if (scenes.length === 0) {
            return;
        }

        // 按行号排序
        const sortedScenes = [...scenes].sort((a, b) => a.line - b.line);

        // 计算新的场景编号
        let expectedScene = 1;
        
        // 找到 fromLine 之前的最后一个场景编号
        const prevScenes = this.index.scenes.filter(
            s => s.episode === episode && s.line < fromLine
        );
        if (prevScenes.length > 0) {
            const lastPrevScene = prevScenes[prevScenes.length - 1];
            expectedScene = lastPrevScene.scene + 1;
        }

        // 从后往前重新编号
        for (let i = sortedScenes.length - 1; i >= 0; i--) {
            const scene = sortedScenes[i];
            const newSceneNum = expectedScene + i;
            
            if (scene.scene !== newSceneNum) {
                const lineContent = editor.getLine(scene.line);
                const match = lineContent.match(SCENE_NUMBER_REGEX);
                
                if (match) {
                    const oldNumber = match[0];
                    const newNumber = `${episode}-${newSceneNum}`;
                    const newLineContent = lineContent.replace(oldNumber, newNumber);
                    
                    editor.replaceRange(
                        newLineContent,
                        { line: scene.line, ch: 0 },
                        { line: scene.line, ch: lineContent.length }
                    );
                }
            }
        }

        // 发送重新编号事件
        this.eventBus.emit('scene:renumbered', { episode, fromLine });
    }

    /**
     * 获取指定集的所有场景
     * @param episode 集数
     * @returns 该集的所有场景
     */
    getScenesForEpisode(episode: number): SceneInfo[] {
        return this.index.scenes.filter(scene => scene.episode === episode);
    }

    /**
     * 获取所有集数列表
     * @returns 集数数组
     */
    getEpisodes(): number[] {
        const episodes = new Set<number>();
        this.index.scenes.forEach(scene => episodes.add(scene.episode));
        return Array.from(episodes).sort((a, b) => a - b);
    }

    /**
     * 根据行号查找场景
     * @param line 行号
     * @returns 场景信息，如果不存在返回 null
     */
    getSceneAtLine(line: number): SceneInfo | null {
        // 找到该行所属的场景（最后一个行号小于等于目标行的场景）
        let result: SceneInfo | null = null;
        for (const scene of this.index.scenes) {
            if (scene.line <= line) {
                result = scene;
            } else {
                break;
            }
        }
        return result;
    }

    /**
     * 检查文档是否需要重新解析
     * @param content 文档内容
     * @returns 是否需要重新解析
     */
    needsReparse(content: string): boolean {
        const newHash = calculateHash(content);
        return this.index.contentHash !== newHash;
    }

    /**
     * 重置索引
     */
    reset(): void {
        this.index = this.createEmptyIndex();
    }
}
