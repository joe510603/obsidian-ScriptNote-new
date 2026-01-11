/**
 * ScriptNote - 分场表导出器
 * 使用 xlsx 库生成 Excel 分场表
 * 包含场景编号、地点、人物、时长等信息
 */

import * as XLSX from 'xlsx';
import { Exporter, SceneIndex, ProjectSettings, ExportOptions } from '../types';
import { WORDS_PER_MINUTE } from '../utils/constants';

/**
 * 分场表行数据
 */
interface BreakdownRow {
    序号: number;           // 序号
    场景编号: string;       // 场景编号（如 1-1）
    集数: number;           // 集数
    场数: number;           // 场数
    时间: string;           // 时间（日/夜等）
    内外景: string;         // 内/外
    地点: string;           // 地点名称
    出场人物: string;       // 出场人物（逗号分隔）
    预估时长: string;       // 预估时长（分钟）
    字数: number;           // 字数
    标签: string;           // 场景标签
    闪回: string;           // 是否闪回
    备注: string;           // 备注
}

/**
 * 分场表导出器类
 * 将剧本场景信息导出为 Excel 分场表
 */
export class BreakdownExporter implements Exporter {
    /** 导出器名称 */
    name = '分场表';
    
    /** 文件扩展名 */
    extension = '.xlsx';
    
    /** MIME 类型 */
    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    /**
     * 导出剧本为 Excel 分场表
     * @param content 文档内容
     * @param index 场景索引
     * @param settings 项目设定
     * @param options 导出选项
     * @returns Excel 文档 Blob
     */
    async export(
        content: string,
        index: SceneIndex,
        settings: ProjectSettings,
        options: ExportOptions
    ): Promise<Blob> {
        // 构建分场表数据
        const rows = this.buildBreakdownRows(content, index);
        
        // 创建工作簿
        const workbook = XLSX.utils.book_new();
        
        // 创建分场表工作表
        const breakdownSheet = this.createBreakdownSheet(rows, settings);
        XLSX.utils.book_append_sheet(workbook, breakdownSheet, '分场表');
        
        // 如果包含设定，添加统计工作表
        if (options.includeSettings) {
            const summarySheet = this.createSummarySheet(rows, index, settings);
            XLSX.utils.book_append_sheet(workbook, summarySheet, '统计汇总');
        }
        
        // 生成 Excel 文件
        const excelBuffer = XLSX.write(workbook, {
            bookType: 'xlsx',
            type: 'array'
        });
        
        return new Blob([excelBuffer], { type: this.mimeType });
    }

    /**
     * 构建分场表行数据
     * @param content 文档内容
     * @param index 场景索引
     * @returns 分场表行数组
     */
    private buildBreakdownRows(content: string, index: SceneIndex): BreakdownRow[] {
        const scenes = index.scenes;
        const lines = content.split('\n');
        const rows: BreakdownRow[] = [];
        
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            
            // 计算场景字数
            const nextSceneLine = i < scenes.length - 1 
                ? scenes[i + 1].line 
                : lines.length;
            const sceneContent = lines.slice(scene.line, nextSceneLine).join('\n');
            const wordCount = this.countContentWords(sceneContent);
            
            // 计算预估时长
            const duration = this.estimateDuration(wordCount);
            
            rows.push({
                序号: i + 1,
                场景编号: `${scene.episode}-${scene.scene}`,
                集数: scene.episode,
                场数: scene.scene,
                时间: scene.time,
                内外景: scene.locationType,
                地点: scene.location,
                出场人物: scene.characters.join('、'),
                预估时长: `${duration} 分钟`,
                字数: wordCount,
                标签: scene.tags.join('、'),
                闪回: scene.isFlashback ? '是' : '',
                备注: ''
            });
        }
        
        return rows;
    }

    /**
     * 创建分场表工作表
     * @param rows 分场表行数据
     * @param settings 项目设定
     * @returns 工作表
     */
    private createBreakdownSheet(
        rows: BreakdownRow[],
        settings: ProjectSettings
    ): XLSX.WorkSheet {
        // 添加标题行
        const headerRow = [
            '序号',
            '场景编号',
            '集数',
            '场数',
            '时间',
            '内外景',
            '地点',
            '出场人物',
            '预估时长',
            '字数',
            '标签',
            '闪回',
            '备注'
        ];
        
        // 转换数据为二维数组
        const data: (string | number)[][] = [headerRow];
        
        for (const row of rows) {
            data.push([
                row.序号,
                row.场景编号,
                row.集数,
                row.场数,
                row.时间,
                row.内外景,
                row.地点,
                row.出场人物,
                row.预估时长,
                row.字数,
                row.标签,
                row.闪回,
                row.备注
            ]);
        }
        
        // 创建工作表
        const sheet = XLSX.utils.aoa_to_sheet(data);
        
        // 设置列宽
        sheet['!cols'] = [
            { wch: 6 },   // 序号
            { wch: 10 },  // 场景编号
            { wch: 6 },   // 集数
            { wch: 6 },   // 场数
            { wch: 8 },   // 时间
            { wch: 8 },   // 内外景
            { wch: 20 },  // 地点
            { wch: 30 },  // 出场人物
            { wch: 12 },  // 预估时长
            { wch: 8 },   // 字数
            { wch: 15 },  // 标签
            { wch: 6 },   // 闪回
            { wch: 20 }   // 备注
        ];
        
        return sheet;
    }

    /**
     * 创建统计汇总工作表
     * @param rows 分场表行数据
     * @param index 场景索引
     * @param settings 项目设定
     * @returns 工作表
     */
    private createSummarySheet(
        rows: BreakdownRow[],
        index: SceneIndex,
        settings: ProjectSettings
    ): XLSX.WorkSheet {
        const data: (string | number)[][] = [];
        
        // 剧本信息
        data.push(['剧本信息', '']);
        data.push(['剧名', settings.title || '']);
        data.push(['']);
        
        // 总体统计
        const totalScenes = rows.length;
        const totalWordCount = rows.reduce((sum, r) => sum + r.字数, 0);
        const totalDuration = this.estimateDuration(totalWordCount);
        
        data.push(['总体统计', '']);
        data.push(['总场景数', totalScenes]);
        data.push(['总字数', totalWordCount]);
        data.push(['预估总时长', `${totalDuration} 分钟`]);
        data.push(['']);
        
        // 按集统计
        data.push(['分集统计', '']);
        data.push(['集数', '场景数', '字数', '预估时长']);
        
        // 按集分组
        const episodeMap = new Map<number, BreakdownRow[]>();
        for (const row of rows) {
            const episodeRows = episodeMap.get(row.集数) || [];
            episodeRows.push(row);
            episodeMap.set(row.集数, episodeRows);
        }
        
        // 按集数排序
        const sortedEpisodes = Array.from(episodeMap.keys()).sort((a, b) => a - b);
        
        for (const episode of sortedEpisodes) {
            const episodeRows = episodeMap.get(episode)!;
            const episodeSceneCount = episodeRows.length;
            const episodeWordCount = episodeRows.reduce((sum, r) => sum + r.字数, 0);
            const episodeDuration = this.estimateDuration(episodeWordCount);
            
            data.push([
                `第${episode}集`,
                episodeSceneCount,
                episodeWordCount,
                `${episodeDuration} 分钟`
            ]);
        }
        
        data.push(['']);
        
        // 地点统计
        data.push(['地点统计', '']);
        data.push(['地点', '出现次数']);
        
        const locationMap = new Map<string, number>();
        for (const row of rows) {
            const count = locationMap.get(row.地点) || 0;
            locationMap.set(row.地点, count + 1);
        }
        
        // 按出现次数排序
        const sortedLocations = Array.from(locationMap.entries())
            .sort((a, b) => b[1] - a[1]);
        
        for (const [location, count] of sortedLocations) {
            data.push([location, count]);
        }
        
        data.push(['']);
        
        // 人物统计
        data.push(['人物统计', '']);
        data.push(['人物', '出场场次']);
        
        const characterMap = new Map<string, number>();
        for (const row of rows) {
            const characters = row.出场人物.split('、').filter(c => c);
            for (const char of characters) {
                const count = characterMap.get(char) || 0;
                characterMap.set(char, count + 1);
            }
        }
        
        // 按出场次数排序
        const sortedCharacters = Array.from(characterMap.entries())
            .sort((a, b) => b[1] - a[1]);
        
        for (const [character, count] of sortedCharacters) {
            data.push([character, count]);
        }
        
        // 创建工作表
        const sheet = XLSX.utils.aoa_to_sheet(data);
        
        // 设置列宽
        sheet['!cols'] = [
            { wch: 20 },
            { wch: 15 },
            { wch: 15 },
            { wch: 15 }
        ];
        
        return sheet;
    }

    /**
     * 计算纯内容字数（排除格式标记）
     * @param text 文本内容
     * @returns 字数
     */
    private countContentWords(text: string): number {
        if (!text) {
            return 0;
        }

        let totalWords = 0;
        const lines = text.split('\n');
        
        // 正则表达式
        const sceneNumberRegex = /^(\d+)-(\d+)/;
        const dialogueRegex = /^(.+?)（(.+?)）：(.+)$/;
        const simpleDialogueRegex = /^(.+?)：(.+)$/;
        const actionRegex = /^△\s*(.*)$/;

        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // 跳过空行
            if (!trimmedLine) {
                continue;
            }

            // 跳过场景头
            if (sceneNumberRegex.test(trimmedLine)) {
                continue;
            }

            // 跳过人物行
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

            // 跳过集标题
            if (trimmedLine.startsWith('#')) {
                continue;
            }

            // 处理台词行
            const dialogueMatch = trimmedLine.match(dialogueRegex);
            if (dialogueMatch) {
                totalWords += this.countWords(dialogueMatch[3]);
                continue;
            }

            // 处理简单台词行
            const simpleDialogueMatch = trimmedLine.match(simpleDialogueRegex);
            if (simpleDialogueMatch) {
                totalWords += this.countWords(simpleDialogueMatch[2]);
                continue;
            }

            // 处理动作描述行
            const actionMatch = trimmedLine.match(actionRegex);
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
     * 计算文本字数
     * @param text 文本内容
     * @returns 字数
     */
    private countWords(text: string): number {
        if (!text) {
            return 0;
        }
        const cleanText = text.replace(/\s+/g, '');
        return cleanText.length;
    }

    /**
     * 估算时长（分钟）
     * @param wordCount 字数
     * @returns 预估时长（分钟），向上取整到 0.5 分钟
     */
    private estimateDuration(wordCount: number): number {
        if (wordCount <= 0) {
            return 0;
        }
        const rawDuration = wordCount / WORDS_PER_MINUTE;
        return Math.ceil(rawDuration * 2) / 2;
    }
}
