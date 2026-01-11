/**
 * ScriptNote - Option/Alt+Tab 触发修饰符选择扩展
 * 在人物名后按 Option+Tab（Mac）或 Alt+Tab（Windows）弹出修饰符选择菜单
 * 支持：（OS）、（VO）、（）自定义情绪、直接加冒号
 * 如果光标在冒号后，会替换冒号
 */

import { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

/**
 * 修饰符选项
 */
interface ModifierOption {
    /** 显示文本 */
    label: string;
    /** 插入的修饰符 */
    modifier: string;
    /** 是否需要用户输入（自定义情绪） */
    needInput: boolean;
}

/**
 * 快捷键配置
 */
interface ModifierHotkey {
    /** 主键 */
    key: string;
    /** 是否需要 Alt/Option 键 */
    altKey: boolean;
    /** 是否需要 Ctrl 键 */
    ctrlKey: boolean;
    /** 是否需要 Shift 键 */
    shiftKey: boolean;
    /** 是否需要 Meta 键（Mac 的 Cmd） */
    metaKey: boolean;
}

/**
 * 默认快捷键：Option+Tab
 */
const DEFAULT_HOTKEY: ModifierHotkey = {
    key: 'Tab',
    altKey: true,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false
};

/**
 * 当前快捷键配置
 */
let currentHotkey: ModifierHotkey = { ...DEFAULT_HOTKEY };

/**
 * 修饰符选项列表
 */
const MODIFIER_OPTIONS: ModifierOption[] = [
    { label: '：（直接台词）', modifier: '：', needInput: false },
    { label: '（OS）：', modifier: '（OS）：', needInput: false },
    { label: '（VO）：', modifier: '（VO）：', needInput: false },
    { label: '（）：自定义情绪', modifier: '（）：', needInput: true }
];

/**
 * Tab 修饰符弹窗类
 */
class TabModifierPopup {
    /** 弹窗容器 */
    private container: HTMLElement | null = null;
    
    /** 编辑器视图 */
    private view: EditorView | null = null;
    
    /** 触发位置（人物名结束位置） */
    private triggerPos: number = 0;
    
    /** 是否需要替换冒号 */
    private replaceColon: boolean = false;
    
    /** 当前选中索引 */
    private selectedIndex: number = 0;
    
    /** 是否可见 */
    private visible: boolean = false;
    
    /** 键盘事件处理函数 */
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
    
    /** 是否在输入模式（自定义情绪） */
    private inputMode: boolean = false;
    
    /** 输入框元素 */
    private inputEl: HTMLInputElement | null = null;

    /**
     * 显示弹窗
     * @param view 编辑器视图
     * @param triggerPos 触发位置
     * @param replaceColon 是否需要替换已有的冒号
     */
    show(view: EditorView, triggerPos: number, replaceColon: boolean = false): void {
        this.hide();
        
        this.view = view;
        this.triggerPos = triggerPos;
        this.replaceColon = replaceColon;
        this.selectedIndex = 0;
        this.visible = true;
        this.inputMode = false;
        
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
        
        this.visible = false;
        this.inputMode = false;
        this.inputEl = null;
        this.view = null;
        this.replaceColon = false;
    }

    /**
     * 是否可见
     */
    isVisible(): boolean {
        return this.visible;
    }

    /**
     * 向上导航
     */
    navigateUp(): void {
        if (this.inputMode) return;
        this.selectedIndex = (this.selectedIndex - 1 + MODIFIER_OPTIONS.length) % MODIFIER_OPTIONS.length;
        this.updateSelection();
    }

    /**
     * 向下导航
     */
    navigateDown(): void {
        if (this.inputMode) return;
        this.selectedIndex = (this.selectedIndex + 1) % MODIFIER_OPTIONS.length;
        this.updateSelection();
    }

    /**
     * 选择当前项
     */
    selectCurrent(): void {
        if (!this.view) return;
        
        const option = MODIFIER_OPTIONS[this.selectedIndex];
        
        if (option.needInput && !this.inputMode) {
            // 进入输入模式
            this.enterInputMode();
        } else if (this.inputMode) {
            // 输入模式下确认
            this.confirmInput();
        } else {
            // 直接插入修饰符
            this.insertModifier(option.modifier);
        }
    }

    /**
     * 进入输入模式（自定义情绪）
     */
    private enterInputMode(): void {
        this.inputMode = true;
        
        // 更新弹窗显示输入框
        const listContainer = this.container?.querySelector('#modifier-popup-list');
        if (!listContainer) return;
        
        listContainer.innerHTML = '';
        
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'screenplay-popup-input-wrapper';
        
        const label = document.createElement('span');
        label.textContent = '输入情绪：';
        inputWrapper.appendChild(label);
        
        this.inputEl = document.createElement('input');
        this.inputEl.type = 'text';
        this.inputEl.className = 'screenplay-popup-input';
        this.inputEl.placeholder = '如：愤怒、微笑、哭泣';
        inputWrapper.appendChild(this.inputEl);
        
        listContainer.appendChild(inputWrapper);
        
        // 聚焦输入框
        setTimeout(() => this.inputEl?.focus(), 0);
    }

    /**
     * 确认输入
     */
    private confirmInput(): void {
        if (!this.inputEl || !this.view) return;
        
        const emotion = this.inputEl.value.trim();
        if (emotion) {
            this.insertModifier(`（${emotion}）：`);
        } else {
            // 空输入，直接加冒号
            this.insertModifier('：');
        }
    }

    /**
     * 插入修饰符
     */
    private insertModifier(modifier: string): void {
        if (!this.view) return;
        
        // 如果需要替换冒号，则替换范围包含冒号
        const from = this.triggerPos;
        const to = this.replaceColon ? this.triggerPos + 1 : this.triggerPos;
        
        this.view.dispatch({
            changes: { from, to, insert: modifier },
            selection: { anchor: from + modifier.length }
        });
        
        this.hide();
        
        // 重新聚焦编辑器
        this.view.focus();
    }

    /**
     * 创建弹窗
     */
    private createPopup(view: EditorView, triggerPos: number): void {
        const coords = view.coordsAtPos(triggerPos);
        if (!coords) return;
        
        this.container = document.createElement('div');
        this.container.className = 'screenplay-modifier-popup';
        this.container.style.cssText = `
            position: fixed;
            left: ${coords.left}px;
            top: ${coords.bottom + 4}px;
            z-index: 1000;
        `;
        
        // 标题
        const header = document.createElement('div');
        header.className = 'screenplay-popup-header';
        header.textContent = '选择台词格式';
        this.container.appendChild(header);
        
        // 列表容器
        const listContainer = document.createElement('div');
        listContainer.className = 'screenplay-popup-list';
        listContainer.id = 'modifier-popup-list';
        this.container.appendChild(listContainer);
        
        // 提示
        const hint = document.createElement('div');
        hint.className = 'screenplay-popup-hint';
        hint.textContent = '↑↓ 选择 · Enter 确认 · Esc 取消';
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
        const listContainer = this.container?.querySelector('#modifier-popup-list');
        if (!listContainer) return;
        
        listContainer.innerHTML = '';
        
        MODIFIER_OPTIONS.forEach((option, index) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'screenplay-popup-item';
            if (index === this.selectedIndex) {
                itemEl.classList.add('selected');
            }
            itemEl.textContent = option.label;
            
            itemEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectedIndex = index;
                this.selectCurrent();
            });
            
            itemEl.addEventListener('mouseenter', () => {
                this.selectedIndex = index;
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
            if (index === this.selectedIndex) {
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
            
            // 输入模式下的特殊处理
            if (this.inputMode) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.confirmInput();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.hide();
                }
                // 其他按键让输入框处理
                return;
            }
            
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
}

/** 全局弹窗实例 */
const tabModifierPopup = new TabModifierPopup();

/**
 * 检查按键是否匹配当前快捷键配置
 */
function matchesHotkey(e: KeyboardEvent): boolean {
    return e.key === currentHotkey.key &&
           e.altKey === currentHotkey.altKey &&
           e.ctrlKey === currentHotkey.ctrlKey &&
           e.shiftKey === currentHotkey.shiftKey &&
           e.metaKey === currentHotkey.metaKey;
}

/**
 * 检查是否应该触发修饰符弹窗
 * 条件：光标前是中文字符（人物名）或冒号
 * 返回：should - 是否触发，pos - 插入位置，replaceColon - 是否需要替换冒号
 */
function shouldTriggerModifierPopup(view: EditorView): { should: boolean; pos: number; replaceColon: boolean } {
    const state = view.state;
    const cursorPos = state.selection.main.head;
    
    // 获取当前行
    const line = state.doc.lineAt(cursorPos);
    const textBefore = state.doc.sliceString(line.from, cursorPos);
    
    // 如果行为空或光标在行首，不触发
    if (textBefore.length === 0) {
        return { should: false, pos: 0, replaceColon: false };
    }
    
    // 如果以 △ 开头，不触发（动作描述行）
    if (textBefore.trim().startsWith('△')) {
        return { should: false, pos: 0, replaceColon: false };
    }
    
    // 如果以 # 开头，不触发（标题行）
    if (textBefore.trim().startsWith('#')) {
        return { should: false, pos: 0, replaceColon: false };
    }
    
    // 如果以数字-数字开头，不触发（场景头）
    if (/^\d+-\d+/.test(textBefore.trim())) {
        return { should: false, pos: 0, replaceColon: false };
    }
    
    // 如果以【开头，不触发
    if (textBefore.trim().startsWith('【')) {
        return { should: false, pos: 0, replaceColon: false };
    }
    
    // 检查光标前是否是冒号（需要替换）
    const lastChar = textBefore.slice(-1);
    if (lastChar === '：' || lastChar === ':') {
        // 检查冒号前是否是人物名（中文或字母）
        if (textBefore.length >= 2) {
            const charBeforeColon = textBefore.slice(-2, -1);
            const isChinese = /[\u4e00-\u9fa5]/.test(charBeforeColon);
            const isLetter = /[a-zA-Z]/.test(charBeforeColon);
            if (isChinese || isLetter) {
                // 返回冒号的位置，需要替换
                return { should: true, pos: cursorPos - 1, replaceColon: true };
            }
        }
        return { should: false, pos: 0, replaceColon: false };
    }
    
    // 检查光标前是否是中文字符或字母（人物名）
    const isChinese = /[\u4e00-\u9fa5]/.test(lastChar);
    const isLetter = /[a-zA-Z]/.test(lastChar);
    
    if (isChinese || isLetter) {
        return { should: true, pos: cursorPos, replaceColon: false };
    }
    
    return { should: false, pos: 0, replaceColon: false };
}

/**
 * 创建 Option+Tab（Mac）/ Alt+Tab（Windows）修饰符选择扩展
 * @param isEnabled 是否启用
 */
export function createTabModifierExtension(isEnabled: () => boolean): Extension {
    return ViewPlugin.fromClass(
        class {
            constructor(private view: EditorView) {
                // 监听快捷键
                this.view.dom.addEventListener('keydown', this.handleKeydown);
            }

            handleKeydown = (e: KeyboardEvent): void => {
                // 如果弹窗已显示，让弹窗处理
                if (tabModifierPopup.isVisible()) return;
                
                // 检查是否匹配快捷键（默认 Option/Alt+Tab）
                if (!matchesHotkey(e)) return;
                
                // 检查是否启用
                if (!isEnabled()) return;
                
                // 检查是否应该触发
                const { should, pos, replaceColon } = shouldTriggerModifierPopup(this.view);
                
                if (should) {
                    e.preventDefault();
                    e.stopPropagation();
                    tabModifierPopup.show(this.view, pos, replaceColon);
                }
            };

            update(_update: ViewUpdate) {
                // 不需要在这里处理
            }

            destroy() {
                this.view.dom.removeEventListener('keydown', this.handleKeydown);
                tabModifierPopup.hide();
            }
        }
    );
}

/**
 * 获取弹窗实例
 */
export function getTabModifierPopup(): TabModifierPopup {
    return tabModifierPopup;
}

/**
 * 设置修饰符选择的快捷键
 * @param hotkey 快捷键配置
 */
export function setModifierHotkey(hotkey: Partial<ModifierHotkey>): void {
    currentHotkey = { ...DEFAULT_HOTKEY, ...hotkey };
}

/**
 * 获取当前快捷键配置
 */
export function getModifierHotkey(): ModifierHotkey {
    return { ...currentHotkey };
}

/**
 * 获取快捷键显示文本
 * 根据平台显示 Option（Mac）或 Alt（Windows/Linux）
 */
export function getModifierHotkeyText(): string {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const parts: string[] = [];
    if (currentHotkey.ctrlKey) parts.push('Ctrl');
    if (currentHotkey.altKey) parts.push(isMac ? 'Option' : 'Alt');
    if (currentHotkey.shiftKey) parts.push('Shift');
    if (currentHotkey.metaKey) parts.push(isMac ? 'Cmd' : 'Win');
    parts.push(currentHotkey.key);
    return parts.join('+');
}
