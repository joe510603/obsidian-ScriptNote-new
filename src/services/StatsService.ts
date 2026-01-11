/**
 * ScriptNote - 统计服务
 * 负责字数统计、时长估算和角色出场统计
 * 使用 LRU 缓存优化性能
 */

import {
    SceneIndex,
    SceneInfo,
    EpisodeStats,
    CharacterStats
} from '../types';
import {
    WORDS_PER_MINUTE,
    DIALOGUE_REGEX,
    SIMPLE_DIALOGUE_REGEX,
    ACTION_REGEX,
    SCENE_NUMBER_REGEX
} from '../utils/constants';

/**
 * LRU 缓存实现
 * 用于缓存统计结果，避免重复计算
 */
class LRUCache<K, V> {
    /** 最大缓存容量 */
    private maxSize: number;
    
    /** 缓存数据 */
    private cache: Map<K, V>;

    /**
     * 构造函数
     * @param maxSize 最大缓存容量
     */
    constructor(maxSize: number = 100) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    /**
     * 获取缓存值
     * @param key 缓存键
     * @returns 缓存值，如果不存在返回 undefined
     */
    get(key: K): V | undefined {
        if (!this.cache.has(key)) {
            return undefined;
        }
        
        // 将访问的项移到最后（最近使用）
        const value = this.cache.get(key)!;
        this.cache.delete(key);
        this.cache.set(key, value);
        
        return value;
    }

    /**
     * 设置缓存值
     * @param key 缓存键
     * @param value 缓存值
     */
    set(key: K, value: V): void {
        // 如果已存在，先删除
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        // 如果超出容量，删除最旧的项
        else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        
        this.cache.set(key, value);
    }

    /**
     * 检查是否存在缓存
     * @param key 缓存键
     * @returns 是否存在
     */
    has(key: K): boolean {
        return this.cache.has(key);
    }

    /**
     * 清除所有缓存
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * 获取缓存大小
     * @returns 缓存项数量
     */
    size(): number {
        return this.cache.size;
    }
}

/**
 * 台词解析结果
 */
interface ParsedDialogue {
    characterName: string;  // 角色名
    emotion?: string;       // 情绪（可选）
    content: string;        // 台词内容
    wordCount: number;      // 字数
}

/**
 * 统计服务类
 * 负责字数统计、时长估算和角色出场统计
 */
export class StatsService {
    /** 统计结果缓存 */
    private cache: LRUCache<string, EpisodeStats[] | CharacterStats[]>;
    
    /** 上次计算的内容哈希 */
    private lastContentHash: string = '';

    /**
     * 构造函数
     * @param cacheSize 缓存大小，默认 100
     */
    constructor(cacheSize: number = 100) {
        this.cache = new LRUCache(cacheSize);
    }

    /**
     * 计算文本字数
     * 中文字符计为1，英文单词计为1
     * @param text 文本内容
     * @returns 字数
     */
    countWords(text: string): number {
        if (!text) {
            return 0;
        }
        
        // 移除空白字符后计算长度
        const cleanText = text.replace(/\s+/g, '');
        return cleanText.length;
    }

    /**
     * 计算纯内容字数（排除格式标记）
     * @param text 文本内容
     * @returns 字数
     */
    countContentWords(text: string): number {
        if (!text) {
            return 0;
        }

        let totalWords = 0;
        const lines = text.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // 跳过空行
            if (!trimmedLine) {
                continue;
            }

            // 跳过场景头（以数字-数字开头）
            if (SCENE_NUMBER_REGEX.test(trimmedLine)) {
                continue;
            }

            // 跳过人物行（以"人 "开头）
            if (trimmedLine.startsWith('人 ')) {
                continue;
            }

            // 跳过闪回标记
            if (trimmedLine === '【闪回】' || trimmedLine === '【闪回结束】') {
                continue;
            }

            // 跳过标签行
            if (trimmedLine.startsWith('【标签：')) {
                continue;
            }

            // 跳过分隔线
            if (trimmedLine === '---') {
                continue;
            }

            // 跳过集标题（以 # 开头）
            if (trimmedLine.startsWith('#')) {
                continue;
            }

            // 处理台词行：提取台词内容
            const dialogueMatch = trimmedLine.match(DIALOGUE_REGEX);
            if (dialogueMatch) {
                // 只计算台词内容的字数
                totalWords += this.countWords(dialogueMatch[3]);
                continue;
            }

            // 处理简单台词行
            const simpleDialogueMatch = trimmedLine.match(SIMPLE_DIALOGUE_REGEX);
            if (simpleDialogueMatch) {
                totalWords += this.countWords(simpleDialogueMatch[2]);
                continue;
            }

            // 处理动作描述行：去掉 △ 前缀
            const actionMatch = trimmedLine.match(ACTION_REGEX);
            if (actionMatch) {
                totalWords += this.countWords(actionMatch[1]);
                continue;
            }

            // 其他内容直接计算字数
            totalWords += this.countWords(trimmedLine);
        }

        return totalWords;
    }

    /**
     * 估算时长（分钟）
     * 使用行业标准：200字/分钟
     * @param wordCount 字数
     * @returns 预估时长（分钟），向上取整到 0.5 分钟
     */
    estimateDuration(wordCount: number): number {
        if (wordCount <= 0) {
            return 0;
        }
        
        const rawDuration = wordCount / WORDS_PER_MINUTE;
        // 向上取整到 0.5 分钟
        return Math.ceil(rawDuration * 2) / 2;
    }

    /**
     * 计算每集统计信息
     * @param content 文档内容
     * @param index 场景索引
     * @returns 每集统计数组
     */
    calculateEpisodeStats(content: string, index: SceneIndex): EpisodeStats[] {
        // 检查缓存
        const cacheKey = `episode:${index.contentHash}`;
        const cached = this.cache.get(cacheKey) as EpisodeStats[] | undefined;
        if (cached) {
            return cached;
        }

        const scenes = index.scenes;
        
        // 如果没有场景，返回空数组
        if (scenes.length === 0) {
            const result: EpisodeStats[] = [];
            this.cache.set(cacheKey, result);
            return result;
        }

        // 按集分组场景
        const episodeMap = new Map<number, SceneInfo[]>();
        for (const scene of scenes) {
            const episodeScenes = episodeMap.get(scene.episode) || [];
            episodeScenes.push(scene);
            episodeMap.set(scene.episode, episodeScenes);
        }

        // 将内容按行分割
        const lines = content.split('\n');

        // 计算每集统计
        const result: EpisodeStats[] = [];
        
        for (const [episode, episodeScenes] of episodeMap) {
            // 按行号排序场景
            const sortedScenes = [...episodeScenes].sort((a, b) => a.line - b.line);
            
            let episodeWordCount = 0;
            
            // 计算每个场景的字数
            for (let i = 0; i < sortedScenes.length; i++) {
                const scene = sortedScenes[i];
                const startLine = scene.line;
                
                // 确定场景结束行
                let endLine: number;
                if (i < sortedScenes.length - 1) {
                    // 下一个场景的开始行之前
                    endLine = sortedScenes[i + 1].line;
                } else {
                    // 最后一个场景：找到下一集的开始或文档末尾
                    const nextEpisodeScene = scenes.find(
                        s => s.episode > episode && s.line > scene.line
                    );
                    endLine = nextEpisodeScene ? nextEpisodeScene.line : lines.length;
                }

                // 提取场景内容
                const sceneContent = lines.slice(startLine, endLine).join('\n');
                episodeWordCount += this.countContentWords(sceneContent);
            }

            result.push({
                episode,
                wordCount: episodeWordCount,
                sceneCount: sortedScenes.length,
                estimatedDuration: this.estimateDuration(episodeWordCount)
            });
        }

        // 按集数排序
        result.sort((a, b) => a.episode - b.episode);

        // 缓存结果
        this.cache.set(cacheKey, result);

        return result;
    }

    /**
     * 解析台词行
     * @param line 行文本
     * @returns 解析结果，如果不是台词返回 null
     */
    private parseDialogue(line: string): ParsedDialogue | null {
        const trimmedLine = line.trim();
        
        // 尝试匹配带情绪的台词格式
        const dialogueMatch = trimmedLine.match(DIALOGUE_REGEX);
        if (dialogueMatch) {
            return {
                characterName: dialogueMatch[1],
                emotion: dialogueMatch[2],
                content: dialogueMatch[3],
                wordCount: this.countWords(dialogueMatch[3])
            };
        }

        // 尝试匹配简单台词格式
        const simpleMatch = trimmedLine.match(SIMPLE_DIALOGUE_REGEX);
        if (simpleMatch) {
            return {
                characterName: simpleMatch[1],
                content: simpleMatch[2],
                wordCount: this.countWords(simpleMatch[2])
            };
        }

        return null;
    }

    /**
     * 计算角色出场统计
     * @param content 文档内容
     * @param index 场景索引
     * @returns 角色统计数组
     */
    calculateCharacterStats(content: string, index: SceneIndex): CharacterStats[] {
        // 检查缓存
        const cacheKey = `character:${index.contentHash}`;
        const cached = this.cache.get(cacheKey) as CharacterStats[] | undefined;
        if (cached) {
            return cached;
        }

        const scenes = index.scenes;
        const lines = content.split('\n');

        // 角色统计映射
        const characterMap = new Map<string, CharacterStats>();

        // 遍历所有场景
        for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
            const scene = scenes[sceneIdx];
            const startLine = scene.line;
            
            // 确定场景结束行
            let endLine: number;
            if (sceneIdx < scenes.length - 1) {
                endLine = scenes[sceneIdx + 1].line;
            } else {
                endLine = lines.length;
            }

            // 记录该场景中出现的角色（用于出场场次统计）
            const sceneCharacters = new Set<string>();

            // 首先从场景的 characters 字段获取出场人物
            for (const charName of scene.characters) {
                sceneCharacters.add(charName);
            }

            // 遍历场景内的每一行，查找台词
            for (let lineIdx = startLine; lineIdx < endLine; lineIdx++) {
                const line = lines[lineIdx];
                const dialogue = this.parseDialogue(line);
                
                if (dialogue) {
                    const charName = dialogue.characterName;
                    sceneCharacters.add(charName);

                    // 获取或创建角色统计
                    let stats = characterMap.get(charName);
                    if (!stats) {
                        stats = {
                            name: charName,
                            sceneCount: 0,
                            dialogueCount: 0,
                            dialogueWordCount: 0,
                            scenes: []
                        };
                        characterMap.set(charName, stats);
                    }

                    // 更新台词统计
                    stats.dialogueCount++;
                    stats.dialogueWordCount += dialogue.wordCount;
                }
            }

            // 更新每个角色的出场场次
            for (const charName of sceneCharacters) {
                let stats = characterMap.get(charName);
                if (!stats) {
                    stats = {
                        name: charName,
                        sceneCount: 0,
                        dialogueCount: 0,
                        dialogueWordCount: 0,
                        scenes: []
                    };
                    characterMap.set(charName, stats);
                }
                
                stats.sceneCount++;
                stats.scenes.push(scene.line);
            }
        }

        // 转换为数组并排序（按出场场次降序）
        const result = Array.from(characterMap.values())
            .sort((a, b) => b.sceneCount - a.sceneCount);

        // 缓存结果
        this.cache.set(cacheKey, result);

        return result;
    }

    /**
     * 计算总字数
     * @param episodeStats 每集统计数组
     * @returns 总字数
     */
    getTotalWordCount(episodeStats: EpisodeStats[]): number {
        return episodeStats.reduce((sum, ep) => sum + ep.wordCount, 0);
    }

    /**
     * 计算总时长
     * @param episodeStats 每集统计数组
     * @returns 总时长（分钟）
     */
    getTotalDuration(episodeStats: EpisodeStats[]): number {
        return episodeStats.reduce((sum, ep) => sum + ep.estimatedDuration, 0);
    }

    /**
     * 获取低出场角色列表
     * 出场场次低于平均值一半的角色被视为低出场
     * @param characterStats 角色统计数组
     * @returns 低出场角色名数组
     */
    getLowAppearanceCharacters(characterStats: CharacterStats[]): string[] {
        if (characterStats.length === 0) {
            return [];
        }

        // 计算平均出场场次
        const totalScenes = characterStats.reduce((sum, c) => sum + c.sceneCount, 0);
        const avgScenes = totalScenes / characterStats.length;
        
        // 低于平均值一半的角色
        const threshold = avgScenes / 2;
        
        return characterStats
            .filter(c => c.sceneCount < threshold)
            .map(c => c.name);
    }

    /**
     * 计算单个场景的字数
     * @param content 文档内容
     * @param scene 场景信息
     * @param nextSceneLine 下一个场景的行号（如果没有则为文档末尾）
     * @returns 场景字数
     */
    calculateSceneWordCount(
        content: string,
        scene: SceneInfo,
        nextSceneLine: number
    ): number {
        const lines = content.split('\n');
        const sceneContent = lines.slice(scene.line, nextSceneLine).join('\n');
        return this.countContentWords(sceneContent);
    }

    /**
     * 计算单个场景的时长
     * @param content 文档内容
     * @param scene 场景信息
     * @param nextSceneLine 下一个场景的行号
     * @returns 场景时长（分钟）
     */
    calculateSceneDuration(
        content: string,
        scene: SceneInfo,
        nextSceneLine: number
    ): number {
        const wordCount = this.calculateSceneWordCount(content, scene, nextSceneLine);
        return this.estimateDuration(wordCount);
    }

    /**
     * 清除缓存
     */
    invalidateCache(): void {
        this.cache.clear();
        this.lastContentHash = '';
    }

    /**
     * 获取缓存大小
     * @returns 缓存项数量
     */
    getCacheSize(): number {
        return this.cache.size();
    }
}
