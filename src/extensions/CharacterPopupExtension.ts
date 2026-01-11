/**
 * ScriptNote - 角色选择弹窗扩展
 * 实现 / 触发角色选择弹窗功能
 * 使用 CodeMirror 6 EditorExtension API
 */

import { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Character } from '../types';
import { characterPopup } from '../ui/CharacterPopup';

/**
 * 检查是否应该触发角色选择弹窗
 * 条件：在行首或 △ 后输入 /
 * @param lineText 当前行文本
 * @param posInLine 光标在行内的位置
 * @returns 是否应该触发
 */
export function shouldTriggerCharacterPopup(lineText: string, posInLine: number): boolean {
    // 获取光标前的文本
    const textBefore = lineText.substring(0, posInLine);
    
    // 检查是否在行首（只有空白字符）
    if (textBefore.trim() === '') {
        return true;
    }
    
    // 检查是否在 △ 后（△ 后可能有空格）
    const trimmedBefore = textBefore.trimEnd();
    if (trimmedBefore === '△' || trimmedBefore.endsWith('△')) {
        return true;
    }
    
    // 检查是否在 △ 加空格后
    if (/^△\s*$/.test(textBefore)) {
        return true;
    }
    
    return false;
}

/**
 * 创建角色选择弹窗扩展
 * @param isEnabled 获取功能是否启用的函数
 * @param getCharacters 获取角色列表的函数
 * @returns CodeMirror 扩展
 */
export function createCharacterPopupExtension(
    isEnabled: () => boolean,
    getCharacters: () => Character[]
): Extension {
    return ViewPlugin.fromClass(
        class {
            constructor(private view: EditorView) {}

            update(update: ViewUpdate) {
                // 检查是否有文档变化
                if (!update.docChanged) return;
                
                // 检查功能是否启用
                if (!isEnabled()) return;
                
                // 获取变化
                update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                    // 检查是否插入了 /
                    const insertedText = inserted.toString();
                    if (insertedText !== '/') return;
                    
                    // 获取当前行信息
                    const pos = fromB + 1; // / 插入后的位置
                    const line = update.state.doc.lineAt(pos);
                    const posInLine = pos - line.from;
                    
                    // 检查是否应该触发弹窗
                    if (shouldTriggerCharacterPopup(line.text, posInLine)) {
                        // 获取角色列表
                        const characters = getCharacters();
                        
                        // 显示弹窗（/ 的位置是 pos - 1）
                        characterPopup.show(this.view, pos - 1, characters);
                    }
                });
            }

            destroy() {
                // 关闭弹窗
                characterPopup.hide();
            }
        }
    );
}
