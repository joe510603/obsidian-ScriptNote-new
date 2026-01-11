/**
 * ScriptNote - PDF 导出器
 * 使用 jspdf 库生成 PDF 文档
 * 按行业标准格式排版
 */

import { jsPDF } from 'jspdf';
import { Exporter, SceneIndex, ProjectSettings, ExportOptions } from '../types';
import {
    SCENE_HEADER_REGEX,
    CHARACTER_LIST_REGEX,
    DIALOGUE_REGEX,
    SIMPLE_DIALOGUE_REGEX,
    ACTION_REGEX,
    FLASHBACK_START,
    FLASHBACK_END
} from '../utils/constants';

/**
 * 行类型枚举
 */
enum LineType {
    SceneHeader,      // 场景头
    CharacterList,    // 出场人物
    Dialogue,         // 台词（带情绪）
    SimpleDialogue,   // 简单台词
    Action,           // 动作描述
    FlashbackStart,   // 闪回开始
    FlashbackEnd,     // 闪回结束
    EpisodeHeader,    // 集标题
    Empty,            // 空行
    Other             // 其他文本
}

/**
 * 解析行类型
 * @param line 行文本
 * @returns 行类型
 */
function getLineType(line: string): LineType {
    const trimmed = line.trim();
    
    if (!trimmed) {
        return LineType.Empty;
    }
    
    if (trimmed === FLASHBACK_START) {
        return LineType.FlashbackStart;
    }
    
    if (trimmed === FLASHBACK_END) {
        return LineType.FlashbackEnd;
    }
    
    if (SCENE_HEADER_REGEX.test(trimmed)) {
        return LineType.SceneHeader;
    }
    
    if (CHARACTER_LIST_REGEX.test(trimmed)) {
        return LineType.CharacterList;
    }
    
    if (DIALOGUE_REGEX.test(trimmed)) {
        return LineType.Dialogue;
    }
    
    if (SIMPLE_DIALOGUE_REGEX.test(trimmed)) {
        return LineType.SimpleDialogue;
    }
    
    if (ACTION_REGEX.test(trimmed)) {
        return LineType.Action;
    }
    
    // 检查是否是集标题（# 第X集）
    if (/^#\s*第\d+集/.test(trimmed)) {
        return LineType.EpisodeHeader;
    }
    
    return LineType.Other;
}

/**
 * PDF 导出器类
 * 将剧本内容导出为格式化的 PDF 文档
 */
export class PDFExporter implements Exporter {
    /** 导出器名称 */
    name = 'PDF';
    
    /** 文件扩展名 */
    extension = '.pdf';
    
    /** MIME 类型 */
    mimeType = 'application/pdf';
    
    /** 页面边距（毫米） */
    private readonly margin = 20;
    
    /** 页面宽度（A4，毫米） */
    private readonly pageWidth = 210;
    
    /** 页面高度（A4，毫米） */
    private readonly pageHeight = 297;
    
    /** 内容区域宽度 */
    private readonly contentWidth: number;
    
    /** 字体大小配置 */
    private readonly fontSize = {
        title: 24,
        heading: 16,
        sceneHeader: 12,
        normal: 10,
        small: 9
    };
    
    /** 行高倍数 */
    private readonly lineHeight = 1.5;

    constructor() {
        this.contentWidth = this.pageWidth - 2 * this.margin;
    }

    /**
     * 导出剧本为 PDF 文档
     * @param content 文档内容
     * @param index 场景索引
     * @param settings 项目设定
     * @param options 导出选项
     * @returns PDF 文档 Blob
     */
    async export(
        content: string,
        index: SceneIndex,
        settings: ProjectSettings,
        options: ExportOptions
    ): Promise<Blob> {
        // 创建 PDF 文档
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        // 当前 Y 位置
        let y = this.margin;
        
        // 添加标题页（如果包含设定）
        if (options.includeSettings && settings.title) {
            y = this.addTitlePage(doc, settings, y);
            // 添加新页面开始正文
            doc.addPage();
            y = this.margin;
        }
        
        // 解析并转换内容
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineType = getLineType(line);
            
            // 检查是否需要换页
            const requiredHeight = this.getRequiredHeight(line, lineType, doc);
            if (y + requiredHeight > this.pageHeight - this.margin) {
                doc.addPage();
                y = this.margin;
            }
            
            // 渲染行
            y = this.renderLine(doc, line, lineType, y);
        }
        
        // 生成 Blob
        const pdfBlob = doc.output('blob');
        return pdfBlob;
    }

    /**
     * 添加标题页
     * @param doc PDF 文档
     * @param settings 项目设定
     * @param startY 起始 Y 位置
     * @returns 结束 Y 位置
     */
    private addTitlePage(doc: jsPDF, settings: ProjectSettings, startY: number): number {
        let y = startY + 40;  // 标题页顶部留白
        
        // 剧名
        doc.setFontSize(this.fontSize.title);
        doc.setFont('helvetica', 'bold');
        const titleWidth = doc.getTextWidth(settings.title);
        const titleX = (this.pageWidth - titleWidth) / 2;
        doc.text(settings.title, titleX, y);
        y += 20;
        
        // 故事梗概
        if (settings.synopsis) {
            y += 10;
            doc.setFontSize(this.fontSize.heading);
            doc.setFont('helvetica', 'bold');
            doc.text('故事梗概', this.margin, y);
            y += 8;
            
            doc.setFontSize(this.fontSize.normal);
            doc.setFont('helvetica', 'normal');
            const synopsisLines = doc.splitTextToSize(settings.synopsis, this.contentWidth);
            doc.text(synopsisLines, this.margin, y);
            y += synopsisLines.length * this.fontSize.normal * this.lineHeight * 0.35;
        }
        
        // 人物列表
        if (settings.characters && settings.characters.length > 0) {
            y += 15;
            doc.setFontSize(this.fontSize.heading);
            doc.setFont('helvetica', 'bold');
            doc.text('主要人物', this.margin, y);
            y += 8;
            
            doc.setFontSize(this.fontSize.normal);
            for (const character of settings.characters) {
                doc.setFont('helvetica', 'bold');
                doc.text(character.name, this.margin, y);
                
                if (character.description) {
                    doc.setFont('helvetica', 'normal');
                    const nameWidth = doc.getTextWidth(character.name);
                    doc.text(`：${character.description}`, this.margin + nameWidth, y);
                }
                
                y += this.fontSize.normal * this.lineHeight * 0.35 + 2;
            }
        }
        
        return y;
    }

    /**
     * 获取渲染行所需的高度
     * @param line 行文本
     * @param lineType 行类型
     * @param doc PDF 文档
     * @returns 所需高度（毫米）
     */
    private getRequiredHeight(line: string, lineType: LineType, doc: jsPDF): number {
        const trimmed = line.trim();
        
        if (lineType === LineType.Empty) {
            return 5;
        }
        
        if (lineType === LineType.EpisodeHeader) {
            return 20;
        }
        
        if (lineType === LineType.SceneHeader) {
            return 12;
        }
        
        // 计算文本换行后的高度
        doc.setFontSize(this.fontSize.normal);
        const textLines = doc.splitTextToSize(trimmed, this.contentWidth);
        return textLines.length * this.fontSize.normal * this.lineHeight * 0.35 + 3;
    }

    /**
     * 渲染一行内容
     * @param doc PDF 文档
     * @param line 行文本
     * @param lineType 行类型
     * @param y 当前 Y 位置
     * @returns 新的 Y 位置
     */
    private renderLine(doc: jsPDF, line: string, lineType: LineType, y: number): number {
        const trimmed = line.trim();
        
        switch (lineType) {
            case LineType.Empty:
                return y + 3;
                
            case LineType.SceneHeader:
                return this.renderSceneHeader(doc, trimmed, y);
                
            case LineType.CharacterList:
                return this.renderCharacterList(doc, trimmed, y);
                
            case LineType.Dialogue:
                return this.renderDialogue(doc, trimmed, y);
                
            case LineType.SimpleDialogue:
                return this.renderSimpleDialogue(doc, trimmed, y);
                
            case LineType.Action:
                return this.renderAction(doc, trimmed, y);
                
            case LineType.FlashbackStart:
            case LineType.FlashbackEnd:
                return this.renderFlashbackMarker(doc, trimmed, y);
                
            case LineType.EpisodeHeader:
                return this.renderEpisodeHeader(doc, trimmed, y);
                
            case LineType.Other:
            default:
                return this.renderOther(doc, trimmed, y);
        }
    }

    /**
     * 渲染场景头
     */
    private renderSceneHeader(doc: jsPDF, text: string, y: number): number {
        doc.setFontSize(this.fontSize.sceneHeader);
        doc.setFont('helvetica', 'bold');
        
        // 添加上边距
        y += 5;
        
        doc.text(text, this.margin, y);
        
        // 添加下划线
        const textWidth = doc.getTextWidth(text);
        doc.setLineWidth(0.3);
        doc.line(this.margin, y + 1, this.margin + textWidth, y + 1);
        
        return y + 8;
    }

    /**
     * 渲染出场人物
     */
    private renderCharacterList(doc: jsPDF, text: string, y: number): number {
        doc.setFontSize(this.fontSize.normal);
        doc.setFont('helvetica', 'italic');
        doc.text(text, this.margin, y);
        return y + this.fontSize.normal * this.lineHeight * 0.35 + 2;
    }

    /**
     * 渲染台词（带情绪）
     */
    private renderDialogue(doc: jsPDF, text: string, y: number): number {
        const match = text.match(DIALOGUE_REGEX);
        
        if (!match) {
            return this.renderOther(doc, text, y);
        }
        
        const [, characterName, emotion, dialogue] = match;
        const indent = 10;
        let x = this.margin + indent;
        
        doc.setFontSize(this.fontSize.normal);
        
        // 角色名（加粗）
        doc.setFont('helvetica', 'bold');
        doc.text(characterName, x, y);
        x += doc.getTextWidth(characterName);
        
        // 情绪（斜体）
        doc.setFont('helvetica', 'italic');
        const emotionText = `（${emotion}）`;
        doc.text(emotionText, x, y);
        x += doc.getTextWidth(emotionText);
        
        // 台词（正常）
        doc.setFont('helvetica', 'normal');
        const dialogueText = `：${dialogue}`;
        const remainingWidth = this.contentWidth - indent - (x - this.margin - indent);
        
        if (doc.getTextWidth(dialogueText) > remainingWidth) {
            // 需要换行
            doc.text('：', x, y);
            y += this.fontSize.normal * this.lineHeight * 0.35;
            const dialogueLines = doc.splitTextToSize(dialogue, this.contentWidth - indent);
            doc.text(dialogueLines, this.margin + indent, y);
            y += (dialogueLines.length - 1) * this.fontSize.normal * this.lineHeight * 0.35;
        } else {
            doc.text(dialogueText, x, y);
        }
        
        return y + this.fontSize.normal * this.lineHeight * 0.35 + 2;
    }

    /**
     * 渲染简单台词
     */
    private renderSimpleDialogue(doc: jsPDF, text: string, y: number): number {
        const match = text.match(SIMPLE_DIALOGUE_REGEX);
        
        if (!match) {
            return this.renderOther(doc, text, y);
        }
        
        const [, characterName, dialogue] = match;
        const indent = 10;
        let x = this.margin + indent;
        
        doc.setFontSize(this.fontSize.normal);
        
        // 角色名（加粗）
        doc.setFont('helvetica', 'bold');
        doc.text(characterName, x, y);
        x += doc.getTextWidth(characterName);
        
        // 台词（正常）
        doc.setFont('helvetica', 'normal');
        const dialogueText = `：${dialogue}`;
        const remainingWidth = this.contentWidth - indent - (x - this.margin - indent);
        
        if (doc.getTextWidth(dialogueText) > remainingWidth) {
            // 需要换行
            doc.text('：', x, y);
            y += this.fontSize.normal * this.lineHeight * 0.35;
            const dialogueLines = doc.splitTextToSize(dialogue, this.contentWidth - indent);
            doc.text(dialogueLines, this.margin + indent, y);
            y += (dialogueLines.length - 1) * this.fontSize.normal * this.lineHeight * 0.35;
        } else {
            doc.text(dialogueText, x, y);
        }
        
        return y + this.fontSize.normal * this.lineHeight * 0.35 + 2;
    }

    /**
     * 渲染动作描述
     */
    private renderAction(doc: jsPDF, text: string, y: number): number {
        doc.setFontSize(this.fontSize.normal);
        doc.setFont('helvetica', 'normal');
        
        const textLines = doc.splitTextToSize(text, this.contentWidth);
        doc.text(textLines, this.margin, y);
        
        return y + textLines.length * this.fontSize.normal * this.lineHeight * 0.35 + 2;
    }

    /**
     * 渲染闪回标记
     */
    private renderFlashbackMarker(doc: jsPDF, text: string, y: number): number {
        doc.setFontSize(this.fontSize.normal);
        doc.setFont('helvetica', 'bold');
        
        // 居中显示
        const textWidth = doc.getTextWidth(text);
        const x = (this.pageWidth - textWidth) / 2;
        
        y += 3;
        doc.text(text, x, y);
        
        return y + this.fontSize.normal * this.lineHeight * 0.35 + 3;
    }

    /**
     * 渲染集标题
     */
    private renderEpisodeHeader(doc: jsPDF, text: string, y: number): number {
        // 移除 # 符号
        const cleanText = text.replace(/^#\s*/, '');
        
        doc.setFontSize(this.fontSize.heading);
        doc.setFont('helvetica', 'bold');
        
        // 居中显示
        const textWidth = doc.getTextWidth(cleanText);
        const x = (this.pageWidth - textWidth) / 2;
        
        y += 10;
        doc.text(cleanText, x, y);
        
        return y + 15;
    }

    /**
     * 渲染其他文本
     */
    private renderOther(doc: jsPDF, text: string, y: number): number {
        doc.setFontSize(this.fontSize.normal);
        doc.setFont('helvetica', 'normal');
        
        const textLines = doc.splitTextToSize(text, this.contentWidth);
        doc.text(textLines, this.margin, y);
        
        return y + textLines.length * this.fontSize.normal * this.lineHeight * 0.35 + 2;
    }
}
