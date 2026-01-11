/**
 * ScriptNote - @ 触发人物选择扩展
 * 输入 @ 弹出人物列表，支持模糊搜索
 * 使用 CodeMirror 6 EditorExtension API
 */

import { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

/**
 * 人物项接口
 */
interface CharacterItem {
    name: string;
    /** 匹配分数，用于排序 */
    score: number;
}

/**
 * 弹窗状态
 */
interface PopupState {
    /** 是否显示 */
    visible: boolean;
    /** @ 符号的位置 */
    triggerPos: number;
    /** 搜索文本（@ 后面的内容） */
    searchText: string;
    /** 过滤后的人物列表 */
    filteredItems: CharacterItem[];
    /** 当前选中索引 */
    selectedIndex: number;
}

/**
 * @ 人物选择弹窗类
 */
class AtCharacterPopup {
    /** 弹窗容器 */
    private container: HTMLElement | null = null;
    
    /** 编辑器视图 */
    private view: EditorView | null = null;
    
    /** 当前状态 */
    private state: PopupState = {
        visible: false,
        triggerPos: 0,
        searchText: '',
        filteredItems: [],
        selectedIndex: 0
    };
    
    /** 所有人物列表 */
    private allCharacters: string[] = [];
    
    /** 获取人物列表的函数 */
    private getCharacters: () => string[] = () => [];
    
    /** 键盘事件处理函数 */
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

    /**
     * 设置获取人物列表的函数
     */
    setGetCharacters(fn: () => string[]): void {
        this.getCharacters = fn;
    }

    /**
     * 显示弹窗
     */
    show(view: EditorView, triggerPos: number): void {
        this.hide();
        
        this.view = view;
        this.allCharacters = this.getCharacters();
        
        // 如果没有人物，显示提示
        if (this.allCharacters.length === 0) {
            this.showEmptyMessage(view, triggerPos);
            return;
        }
        
        this.state = {
            visible: true,
            triggerPos,
            searchText: '',
            filteredItems: this.allCharacters.map(name => ({ name, score: 0 })),
            selectedIndex: 0
        };
        
        this.createPopup(view, triggerPos);
        this.bindKeyboardEvents();
    }

    /**
     * 隐藏弹窗
     */
    hide(): void {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler, true);
            this.keydownHandler = null;
        }
        
        this.state.visible = false;
        this.view = null;
    }

    /**
     * 是否可见
     */
    isVisible(): boolean {
        return this.state.visible;
    }

    /**
     * 更新搜索文本
     */
    updateSearch(searchText: string): void {
        this.state.searchText = searchText;
        
        // 过滤人物
        if (searchText === '') {
            this.state.filteredItems = this.allCharacters.map(name => ({ name, score: 0 }));
        } else {
            this.state.filteredItems = this.allCharacters
                .filter(name => name.includes(searchText))
                .map(name => ({
                    name,
                    score: name.indexOf(searchText)
                }))
                .sort((a, b) => a.score - b.score);
        }
        
        this.state.selectedIndex = 0;
        this.renderList();
    }

    /**
     * 向上导航
     */
    navigateUp(): void {
        if (this.state.filteredItems.length === 0) return;
        this.state.selectedIndex = (this.state.selectedIndex - 1 + this.state.filteredItems.length) % this.state.filteredItems.length;
        this.updateSelection();
    }

    /**
     * 向下导航
     */
    navigateDown(): void {
        if (this.state.filteredItems.length === 0) return;
        this.state.selectedIndex = (this.state.selectedIndex + 1) % this.state.filteredItems.length;
        this.updateSelection();
    }

    /**
     * 选择当前项
     */
    selectCurrent(): void {
        if (!this.view || this.state.filteredItems.length === 0) return;
        
        const item = this.state.filteredItems[this.state.selectedIndex];
        this.insertCharacter(item.name);
    }

    /**
     * 插入人物名
     */
    private insertCharacter(name: string): void {
        if (!this.view) return;
        
        // 计算要替换的范围：从 @ 到当前光标位置
        const from = this.state.triggerPos;
        const to = this.view.state.selection.main.head;
        
        // 插入人物名 + 冒号
        const insertText = name + '：';
        this.view.dispatch({
            changes: { from, to, insert: insertText },
            selection: { anchor: from + insertText.length }
        });
        
        this.hide();
    }

    /**
     * 创建弹窗
     */
    private createPopup(view: EditorView, triggerPos: number): void {
        const coords = view.coordsAtPos(triggerPos);
        if (!coords) return;
        
        this.container = document.createElement('div');
        this.container.className = 'screenplay-at-popup';
        this.container.style.cssText = `
            position: fixed;
            left: ${coords.left}px;
            top: ${coords.bottom + 4}px;
            z-index: 1000;
        `;
        
        // 标题
        const header = document.createElement('div');
        header.className = 'screenplay-popup-header';
        header.textContent = '选择人物';
        this.container.appendChild(header);
        
        // 列表容器
        const listContainer = document.createElement('div');
        listContainer.className = 'screenplay-popup-list';
        listContainer.id = 'at-popup-list';
        this.container.appendChild(listContainer);
        
        // 提示
        const hint = document.createElement('div');
        hint.className = 'screenplay-popup-hint';
        hint.textContent = '输入过滤 · ↑↓ 选择 · Enter/Tab 确认 · Esc 取消';
        this.container.appendChild(hint);
        
        document.body.appendChild(this.container);
        
        this.renderList();
        
        // 点击外部关闭
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick);
        }, 0);
    }

    /**
     * 渲染列表
     */
    private renderList(): void {
        const listContainer = this.container?.querySelector('#at-popup-list');
        if (!listContainer) return;
        
        listContainer.innerHTML = '';
        
        if (this.state.filteredItems.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'screenplay-popup-empty-item';
            empty.textContent = '无匹配人物';
            listContainer.appendChild(empty);
            return;
        }
        
        this.state.filteredItems.forEach((item, index) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'screenplay-popup-item';
            if (index === this.state.selectedIndex) {
                itemEl.classList.add('selected');
            }
            itemEl.textContent = item.name;
            
            itemEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.state.selectedIndex = index;
                this.selectCurrent();
            });
            
            itemEl.addEventListener('mouseenter', () => {
                this.state.selectedIndex = index;
                this.updateSelection();
            });
            
            listContainer.appendChild(itemEl);
        });
    }

    /**
     * 更新选中状态
     */
    private updateSelection(): void {
        const items = this.container?.querySelectorAll('.screenplay-popup-item');
        if (!items) return;
        
        items.forEach((item, index) => {
            if (index === this.state.selectedIndex) {
                item.classList.add('selected');
                (item as HTMLElement).scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    /**
     * 绑定键盘事件
     */
    private bindKeyboardEvents(): void {
        this.keydownHandler = (e: KeyboardEvent) => {
            if (!this.isVisible()) return;
            
            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    e.stopPropagation();
                    this.navigateUp();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    e.stopPropagation();
                    this.navigateDown();
                    break;
                case 'Enter':
                case 'Tab':
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectCurrent();
                    break;
                case 'Escape':
                    e.preventDefault();
                    e.stopPropagation();
                    this.hide();
                    break;
            }
        };
        
        document.addEventListener('keydown', this.keydownHandler, true);
    }

    /**
     * 处理点击外部
     */
    private handleOutsideClick = (e: MouseEvent): void => {
        if (this.container && !this.container.contains(e.target as Node)) {
            this.hide();
            document.removeEventListener('click', this.handleOutsideClick);
        }
    };

    /**
     * 显示空消息
     */
    private showEmptyMessage(view: EditorView, triggerPos: number): void {
        const coords = view.coordsAtPos(triggerPos);
        if (!coords) return;
        
        this.container = document.createElement('div');
        this.container.className = 'screenplay-at-popup screenplay-popup-empty';
        this.container.style.cssText = `
            position: fixed;
            left: ${coords.left}px;
            top: ${coords.bottom + 4}px;
            z-index: 1000;
        `;
        
        const message = document.createElement('div');
        message.className = 'screenplay-popup-message';
        message.textContent = '暂无人物，请先在剧本中添加场景和人物';
        this.container.appendChild(message);
        
        document.body.appendChild(this.container);
        
        setTimeout(() => this.hide(), 2000);
        document.addEventListener('click', this.handleOutsideClick);
    }
}

/** 全局弹窗实例 */
const atPopup = new AtCharacterPopup();

/**
 * 创建 @ 人物选择扩展
 * @param isEnabled 是否启用
 * @param getCharacters 获取人物列表函数（返回人物名数组）
 */
export function createAtCharacterExtension(
    isEnabled: () => boolean,
    getCharacters: () => string[]
): Extension {
    atPopup.setGetCharacters(getCharacters);
    
    return ViewPlugin.fromClass(
        class {
            constructor(private view: EditorView) {}

            update(update: ViewUpdate) {
                if (!update.docChanged) return;
                if (!isEnabled()) return;
                
                // 遍历所有变更，检查是否输入了 @
                let triggered = false;
                update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                    if (triggered) return;
                    
                    const insertedText = inserted.toString();
                    
                    // 检查插入的文本是否包含 @
                    // 支持单字符输入和粘贴
                    if (insertedText.includes('@')) {
                        // 找到 @ 在插入文本中的位置
                        const atIndexInInserted = insertedText.lastIndexOf('@');
                        // 计算 @ 在文档中的实际位置
                        const atPosInDoc = fromB + atIndexInInserted;
                        
                        // 触发弹窗
                        triggered = true;
                        // 使用 setTimeout 确保文档更新完成后再显示弹窗
                        setTimeout(() => {
                            atPopup.show(this.view, atPosInDoc);
                        }, 0);
                    }
                });
                
                // 如果弹窗可见且没有新触发，更新搜索
                if (atPopup.isVisible() && !triggered) {
                    const state = this.view.state;
                    const pos = state.selection.main.head;
                    
                    // 向前查找 @
                    const lineStart = state.doc.lineAt(pos).from;
                    const textBefore = state.doc.sliceString(lineStart, pos);
                    const atIndex = textBefore.lastIndexOf('@');
                    
                    if (atIndex !== -1) {
                        const atPos = lineStart + atIndex;
                        const searchText = state.doc.sliceString(atPos + 1, pos);
                        atPopup.updateSearch(searchText);
                    } else {
                        // @ 被删除了，关闭弹窗
                        atPopup.hide();
                    }
                }
            }

            destroy() {
                atPopup.hide();
            }
        }
    );
}

/**
 * 获取弹窗实例（用于外部控制）
 */
export function getAtPopup(): AtCharacterPopup {
    return atPopup;
}
