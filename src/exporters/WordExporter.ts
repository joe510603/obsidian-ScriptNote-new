/**
 * ScriptNote - Word 导出器
 * 使用 docx 库生成 Word 文档
 * 格式化场景头、台词、动作描述，保留所有格式
 * 
 * 格式规范（可在设置中自定义）：
 * - 集标题：黑体，16pt，居中
 * - 场景头：黑体，12pt，加粗
 * - 正文：宋体，12pt
 * - 角色名：加粗
 * - 台词：正常
 * - 动作描述（△）：楷体
 */

import {
    Document,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    Packer
} from 'docx';
import { Exporter, SceneIndex, ProjectSettings, ExportOptions, ExportFormatSettings } from '../types';
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
 * 默认导出格式设置
 */
const DEFAULT_FORMAT: ExportFormatSettings = {
    episodeTitle: { font: 'SimHei', size: 16, bold: true, center: true },
    sceneHeader: { font: 'SimHei', size: 12, bold: true },
    body: { font: 'SimSun', size: 12 },
    characterName: { font: 'SimSun', size: 12, bold: true },
    action: { font: 'KaiTi', size: 12 }
};

/**
 * 将 pt 转换为 half-points（Word 使用的单位）
 * @param pt 字号（pt）
 * @returns half-points 值
 */
function ptToHalfPoints(pt: number): number {
    return pt * 2;
}

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
    
    // 检查是否是集标题（# 第X集）- 必须在场景头之前检查
    if (/^#\s*第.+集/.test(trimmed)) {
        return LineType.EpisodeHeader;
    }
    
    if (SCENE_HEADER_REGEX.test(trimmed)) {
        return LineType.SceneHeader;
    }
    
    // 检查人物行（人物：xxx 格式）
    if (/^人物[：:]/.test(trimmed)) {
        return LineType.CharacterList;
    }
    
    if (CHARACTER_LIST_REGEX.test(trimmed)) {
        return LineType.CharacterList;
    }
    
    if (ACTION_REGEX.test(trimmed)) {
        return LineType.Action;
    }
    
    if (DIALOGUE_REGEX.test(trimmed)) {
        return LineType.Dialogue;
    }
    
    if (SIMPLE_DIALOGUE_REGEX.test(trimmed)) {
        return LineType.SimpleDialogue;
    }
    
    return LineType.Other;
}

/**
 * Word 导出器类
 * 将剧本内容导出为格式化的 Word 文档
 */
export class WordExporter implements Exporter {
    /** 导出器名称 */
    name = 'word';
    
    /** 文件扩展名 */
    extension = '.docx';
    
    /** MIME 类型 */
    mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    /** 当前使用的格式设置 */
    private format: ExportFormatSettings = DEFAULT_FORMAT;

    /**
     * 设置导出格式
     * @param format 格式设置
     */
    setFormat(format: ExportFormatSettings): void {
        this.format = format;
    }

    /**
     * 导出剧本为 Word 文档
     * @param content 文档内容
     * @param index 场景索引
     * @param settings 项目设定
     * @param options 导出选项
     * @returns Word 文档 Blob
     */
    async export(
        content: string,
        index: SceneIndex,
        settings: ProjectSettings,
        options: ExportOptions
    ): Promise<Blob> {
        const paragraphs: Paragraph[] = [];
        
        // 添加标题页（如果包含设定且有标题）
        if (options.includeSettings && settings.title) {
            paragraphs.push(...this.createTitlePage(settings));
        }
        
        // 解析并转换内容
        const lines = content.split('\n');
        
        // 跳过 frontmatter
        let startIndex = 0;
        if (lines[0]?.trim() === '---') {
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === '---') {
                    startIndex = i + 1;
                    break;
                }
            }
        }
        
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            const lineType = getLineType(line);
            const paragraph = this.createParagraph(line, lineType);
            
            if (paragraph) {
                paragraphs.push(paragraph);
            }
        }
        
        // 创建文档
        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: 1440,    // 1 inch = 1440 twips
                            right: 1440,
                            bottom: 1440,
                            left: 1440
                        }
                    }
                },
                children: paragraphs
            }]
        });
        
        // 生成 Blob
        const buffer = await Packer.toBlob(doc);
        return buffer;
    }

    /**
     * 创建标题页
     * @param settings 项目设定
     * @returns 标题页段落数组
     */
    private createTitlePage(settings: ProjectSettings): Paragraph[] {
        const paragraphs: Paragraph[] = [];
        
        // 剧名 - 使用集标题格式，但字号更大（28pt）
        paragraphs.push(new Paragraph({
            children: [
                new TextRun({
                    text: settings.title,
                    bold: true,
                    size: 56,  // 28pt
                    font: this.format.episodeTitle.font
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
        }));
        
        // 故事梗概（如果有）
        if (settings.synopsis) {
            paragraphs.push(new Paragraph({
                children: [
                    new TextRun({
                        text: '故事梗概',
                        bold: true,
                        size: 28,  // 14pt
                        font: this.format.sceneHeader.font
                    })
                ],
                spacing: { before: 400, after: 200 }
            }));
            
            paragraphs.push(new Paragraph({
                children: [
                    new TextRun({
                        text: settings.synopsis,
                        size: ptToHalfPoints(this.format.body.size),
                        font: this.format.body.font
                    })
                ],
                spacing: { after: 400 }
            }));
        }
        
        // 人物列表（如果有）
        if (settings.characters && settings.characters.length > 0) {
            paragraphs.push(new Paragraph({
                children: [
                    new TextRun({
                        text: '主要人物',
                        bold: true,
                        size: 28,  // 14pt
                        font: this.format.sceneHeader.font
                    })
                ],
                spacing: { before: 400, after: 200 }
            }));
            
            for (const character of settings.characters) {
                const characterText = character.description 
                    ? `${character.name}：${character.description}`
                    : character.name;
                    
                paragraphs.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: characterText,
                            size: ptToHalfPoints(this.format.body.size),
                            font: this.format.body.font
                        })
                    ],
                    spacing: { after: 100 }
                }));
            }
        }
        
        // 分页符
        paragraphs.push(new Paragraph({
            children: [],
            pageBreakBefore: true
        }));
        
        return paragraphs;
    }

    /**
     * 根据行类型创建段落
     * @param line 行文本
     * @param lineType 行类型
     * @returns 段落对象，如果是空行返回空段落
     */
    private createParagraph(line: string, lineType: LineType): Paragraph | null {
        const trimmed = line.trim();
        
        switch (lineType) {
            case LineType.Empty:
                return new Paragraph({ children: [] });
                
            case LineType.SceneHeader:
                return this.createSceneHeaderParagraph(trimmed);
                
            case LineType.CharacterList:
                return this.createCharacterListParagraph(trimmed);
                
            case LineType.Dialogue:
                return this.createDialogueParagraph(trimmed);
                
            case LineType.SimpleDialogue:
                return this.createSimpleDialogueParagraph(trimmed);
                
            case LineType.Action:
                return this.createActionParagraph(trimmed);
                
            case LineType.FlashbackStart:
                return this.createFlashbackStartParagraph();
                
            case LineType.FlashbackEnd:
                return this.createFlashbackEndParagraph();
                
            case LineType.EpisodeHeader:
                return this.createEpisodeHeaderParagraph(trimmed);
                
            case LineType.Other:
            default:
                return this.createOtherParagraph(trimmed);
        }
    }

    /**
     * 创建场景头段落
     * 格式：使用 sceneHeader 设置
     */
    private createSceneHeaderParagraph(text: string): Paragraph {
        return new Paragraph({
            children: [
                new TextRun({
                    text: text,
                    bold: this.format.sceneHeader.bold,
                    size: ptToHalfPoints(this.format.sceneHeader.size),
                    font: this.format.sceneHeader.font
                })
            ],
            spacing: { before: 300, after: 100 }
        });
    }

    /**
     * 创建出场人物段落
     * 格式：使用 body 设置，斜体
     */
    private createCharacterListParagraph(text: string): Paragraph {
        return new Paragraph({
            children: [
                new TextRun({
                    text: text,
                    italics: true,
                    size: ptToHalfPoints(this.format.body.size),
                    font: this.format.body.font
                })
            ],
            spacing: { after: 200 }
        });
    }

    /**
     * 创建台词段落（带情绪）
     * 格式：角色名使用 characterName 设置，情绪斜体，台词使用 body 设置
     */
    private createDialogueParagraph(text: string): Paragraph {
        const match = text.match(DIALOGUE_REGEX);
        
        if (!match) {
            return this.createOtherParagraph(text);
        }
        
        const [, characterName, emotion, dialogue] = match;
        
        return new Paragraph({
            children: [
                new TextRun({
                    text: characterName,
                    bold: this.format.characterName.bold,
                    size: ptToHalfPoints(this.format.characterName.size),
                    font: this.format.characterName.font
                }),
                new TextRun({
                    text: `（${emotion}）`,
                    italics: true,
                    size: ptToHalfPoints(this.format.body.size),
                    font: this.format.body.font
                }),
                new TextRun({
                    text: `：${dialogue}`,
                    size: ptToHalfPoints(this.format.body.size),
                    font: this.format.body.font
                })
            ],
            spacing: { after: 100 }
        });
    }

    /**
     * 创建简单台词段落
     * 格式：角色名使用 characterName 设置，台词使用 body 设置
     */
    private createSimpleDialogueParagraph(text: string): Paragraph {
        const match = text.match(SIMPLE_DIALOGUE_REGEX);
        
        if (!match) {
            return this.createOtherParagraph(text);
        }
        
        const [, characterName, dialogue] = match;
        
        return new Paragraph({
            children: [
                new TextRun({
                    text: characterName,
                    bold: this.format.characterName.bold,
                    size: ptToHalfPoints(this.format.characterName.size),
                    font: this.format.characterName.font
                }),
                new TextRun({
                    text: `：${dialogue}`,
                    size: ptToHalfPoints(this.format.body.size),
                    font: this.format.body.font
                })
            ],
            spacing: { after: 100 }
        });
    }

    /**
     * 创建动作描述段落
     * 格式：使用 action 设置，保留 △ 符号
     */
    private createActionParagraph(text: string): Paragraph {
        return new Paragraph({
            children: [
                new TextRun({
                    text: text,
                    size: ptToHalfPoints(this.format.action.size),
                    font: this.format.action.font
                })
            ],
            spacing: { after: 100 }
        });
    }

    /**
     * 创建闪回开始段落
     * 格式：使用 sceneHeader 字体，居中，加粗
     */
    private createFlashbackStartParagraph(): Paragraph {
        return new Paragraph({
            children: [
                new TextRun({
                    text: FLASHBACK_START,
                    bold: true,
                    size: ptToHalfPoints(this.format.body.size),
                    font: this.format.sceneHeader.font
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 }
        });
    }

    /**
     * 创建闪回结束段落
     * 格式：使用 sceneHeader 字体，居中，加粗
     */
    private createFlashbackEndParagraph(): Paragraph {
        return new Paragraph({
            children: [
                new TextRun({
                    text: FLASHBACK_END,
                    bold: true,
                    size: ptToHalfPoints(this.format.body.size),
                    font: this.format.sceneHeader.font
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 }
        });
    }

    /**
     * 创建集标题段落
     * 格式：使用 episodeTitle 设置
     */
    private createEpisodeHeaderParagraph(text: string): Paragraph {
        // 移除 # 符号
        const cleanText = text.replace(/^#\s*/, '');
        
        return new Paragraph({
            children: [
                new TextRun({
                    text: cleanText,
                    bold: this.format.episodeTitle.bold,
                    size: ptToHalfPoints(this.format.episodeTitle.size),
                    font: this.format.episodeTitle.font
                })
            ],
            heading: HeadingLevel.HEADING_1,
            alignment: this.format.episodeTitle.center ? AlignmentType.CENTER : AlignmentType.LEFT,
            spacing: { before: 400, after: 300 }
        });
    }

    /**
     * 创建其他文本段落
     * 格式：使用 body 设置
     */
    private createOtherParagraph(text: string): Paragraph {
        return new Paragraph({
            children: [
                new TextRun({
                    text: text,
                    size: ptToHalfPoints(this.format.body.size),
                    font: this.format.body.font
                })
            ],
            spacing: { after: 100 }
        });
    }
}
