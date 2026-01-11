/**
 * ScriptNote - 智能回车扩展
 * 实现回车后自动插入 △ 动作描述符号
 * 使用 CodeMirror 6 EditorExtension API
 */

import { Extension, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { EditorView } from '@codemirror/view';

/**
 * 检查行是否以 △ 开头
 * @param line 行内容
 * @returns 是否以 △ 开头
 */
function lineStartsWithTriangle(line: string): boolean {
    return line.trimStart().startsWith('△');
}

/**
 * 检查行是否是台词行（包含角色名和冒号）
 * @param line 行内容
 * @returns 是否是台词行
 */
function isDialogueLine(line: string): boolean {
    // 台词格式：角色名：台词 或 角色名（情绪）：台词
    const trimmed = line.trim();
    // 检查是否包含中文冒号，且冒号前有内容
    const colonIndex = trimmed.indexOf('：');
    return colonIndex > 0;
}

/**
 * 检查行是否是场景头行
 * @param line 行内容
 * @returns 是否是场景头行
 */
function isSceneHeaderLine(line: string): boolean {
    // 场景头格式：编号 时间 内外景 地点（如：1-1 日 内 咖啡馆）
    const sceneHeaderRegex = /^\d+-\d+\s+/;
    return sceneHeaderRegex.test(line.trim());
}

/**
 * 检查行是否是人物列表行
 * @param line 行内容
 * @returns 是否是人物列表行
 */
function isCharacterListLine(line: string): boolean {
    // 人物列表格式：人 角色1 角色2 ...
    return line.trim().startsWith('人 ');
}

/**
 * 检查行是否是特殊标记行（闪回、标签等）
 * @param line 行内容
 * @returns 是否是特殊标记行
 */
function isSpecialMarkerLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('【') && trimmed.endsWith('】');
}

/**
 * 检查行是否为空或只有空白字符
 * @param line 行内容
 * @returns 是否为空行
 */
function isEmptyLine(line: string): boolean {
    return line.trim() === '';
}

/**
 * 判断是否应该在新行插入 △
 * @param currentLine 当前行内容
 * @returns 是否应该插入 △
 */
export function shouldInsertTriangle(currentLine: string): boolean {
    // 如果当前行为空，不插入 △
    if (isEmptyLine(currentLine)) {
        return false;
    }
    
    // 如果当前行已经以 △ 开头，不再插入
    if (lineStartsWithTriangle(currentLine)) {
        return false;
    }
    
    // 如果是场景头行，不插入 △（下一行通常是人物列表）
    if (isSceneHeaderLine(currentLine)) {
        return false;
    }
    
    // 如果是人物列表行，插入 △（开始写动作描述）
    if (isCharacterListLine(currentLine)) {
        return true;
    }
    
    // 如果是特殊标记行，不插入 △
    if (isSpecialMarkerLine(currentLine)) {
        return false;
    }
    
    // 如果是台词行，插入 △（台词后通常是动作描述）
    if (isDialogueLine(currentLine)) {
        return true;
    }
    
    // 其他情况（普通文本行），插入 △
    return true;
}

/**
 * 创建智能回车扩展
 * @param isEnabled 获取功能是否启用的函数
 * @returns CodeMirror 扩展
 */
export function createSmartEnterExtension(isEnabled: () => boolean): Extension {
    return Prec.high(
        keymap.of([
            {
                key: 'Enter',
                run: (view: EditorView): boolean => {
                    // 检查功能是否启用
                    if (!isEnabled()) {
                        return false; // 返回 false 让默认行为处理
                    }
                    
                    const state = view.state;
                    const selection = state.selection.main;
                    
                    // 获取当前行
                    const currentLineNumber = state.doc.lineAt(selection.head).number;
                    const currentLine = state.doc.line(currentLineNumber);
                    const currentLineText = currentLine.text;
                    
                    // 判断是否应该插入 △
                    const shouldInsert = shouldInsertTriangle(currentLineText);
                    
                    // 构建新行内容
                    const newLineContent = shouldInsert ? '\n△ ' : '\n';
                    
                    // 执行插入
                    view.dispatch({
                        changes: {
                            from: selection.head,
                            to: selection.head,
                            insert: newLineContent
                        },
                        selection: {
                            anchor: selection.head + newLineContent.length
                        }
                    });
                    
                    return true; // 返回 true 表示已处理
                }
            }
        ])
    );
}

