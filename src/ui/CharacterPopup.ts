/**
 * ScriptNote - 角色选择弹窗
 * 通过 / 触发，支持键盘导航选择角色
 */

import { EditorView } from '@codemirror/view';
import { Character, PopupItem } from '../types';

/**
 * 角色选择弹窗类
 * 管理弹窗的显示、隐藏和键盘导航
 */
export class CharacterPopup {
    /** 弹窗项列表 */
    private items: PopupItem[] = [];
    
    /** 当前选中的索引 */
    private selectedIndex: number = 0;
    
    /** 弹窗容器元素 */
    private container: HTMLElement | null = null;
    
    /** 当前编辑器视图 */
    private view: EditorView | null = null;
    
    /** 触发位置（/ 的位置） */
    private triggerPos: number = 0;
    
    /** 当前选中的角色（用于特殊类型选择） */
    private selectedCharacter: Character | null = null;
    
    /** 是否在特殊类型选择模式 */
    private isSpecialTypeMode: boolean = false;
    
    /** 键盘事件处理函数引用（用于移除监听） */
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

    /**
     * 显示弹窗
     * @param view 编辑器视图
     * @param triggerPos 触发位置
     * @param characters 角色列表
     */
    show(view: EditorView, triggerPos: number, characters: Character[]): void {
        // 如果已有弹窗，先关闭
        this.hide();
        
        this.view = view;
        this.triggerPos = triggerPos;
        this.selectedIndex = 0;
        this.isSpecialTypeMode = false;
        this.selectedCharacter = null;
        
        // 构建弹窗项
        this.items = this.buildItems(characters);
        
        if (this.items.length === 0) {
            // 没有角色，显示提示
            this.showNoCharactersMessage(view, triggerPos);
            return;
        }
        
        // 创建弹窗
        this.createPopup(view, triggerPos);
        
        // 绑定键盘事件
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
        
        // 移除键盘事件监听
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler, true);
            this.keydownHandler = null;
        }
        
        this.view = null;
        this.items = [];
        this.selectedIndex = 0;
        this.isSpecialTypeMode = false;
        this.selectedCharacter = null;
    }

    /**
     * 检查弹窗是否显示中
     */
    isVisible(): boolean {
        return this.container !== null;
    }

    /**
     * 向上导航
     */
    navigateUp(): void {
        if (this.items.length === 0) return;
        
        this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
        this.updateSelection();
    }

    /**
     * 向下导航
     */
    navigateDown(): void {
        if (this.items.length === 0) return;
        
        this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
        this.updateSelection();
    }

    /**
     * 选择当前项
     */
    selectCurrent(): void {
        if (this.items.length === 0 || !this.view) return;
        
        const item = this.items[this.selectedIndex];
        
        if (!this.isSpecialTypeMode && item.type === 'normal') {
            // 普通角色，显示特殊类型选择
            this.showSpecialTypeSelection(item);
        } else {
            // 插入角色格式
            this.insertCharacter(item);
        }
    }

    /**
     * 直接选择普通格式（不显示特殊类型）
     */
    selectNormal(): void {
        if (this.items.length === 0 || !this.view) return;
        
        const item = this.items[this.selectedIndex];
        // 强制使用普通格式
        const normalItem: PopupItem = { ...item, type: 'normal' };
        this.insertCharacter(normalItem);
    }

    /**
     * 显示特殊类型选择
     * @param characterItem 选中的角色项
     */
    private showSpecialTypeSelection(characterItem: PopupItem): void {
        this.isSpecialTypeMode = true;
        this.selectedCharacter = {
            id: characterItem.id,
            name: characterItem.name,
            description: '',
            traits: []
        };
        
        // 构建特殊类型选项
        this.items = [
            { id: characterItem.id, name: `${characterItem.name}（普通）`, type: 'normal' },
            { id: characterItem.id, name: `${characterItem.name}（电话音）`, type: 'phone' },
            { id: characterItem.id, name: `${characterItem.name}（画外音）`, type: 'voiceover' }
        ];
        this.selectedIndex = 0;
        
        // 更新弹窗内容
        this.updatePopupContent();
    }

    /**
     * 插入角色格式到编辑器
     * @param item 弹窗项
     */
    private insertCharacter(item: PopupItem): void {
        if (!this.view) return;
        
        // 获取角色名（去除特殊类型后缀）
        let characterName = item.name;
        if (this.isSpecialTypeMode && this.selectedCharacter) {
            characterName = this.selectedCharacter.name;
        }
        
        // 根据类型构建插入文本
        let insertText: string;
        switch (item.type) {
            case 'phone':
                insertText = `${characterName}（电话音）：`;
                break;
            case 'voiceover':
                insertText = `${characterName}（画外音）：`;
                break;
            default:
                insertText = `${characterName}：`;
        }
        
        // 替换 / 为角色格式
        this.view.dispatch({
            changes: {
                from: this.triggerPos,
                to: this.triggerPos + 1, // 删除 /
                insert: insertText
            },
            selection: {
                anchor: this.triggerPos + insertText.length
            }
        });
        
        // 关闭弹窗
        this.hide();
    }

    /**
     * 构建弹窗项列表
     * @param characters 角色列表
     * @returns 弹窗项列表
     */
    private buildItems(characters: Character[]): PopupItem[] {
        return characters.map(char => ({
            id: char.id,
            name: char.name,
            type: 'normal' as const
        }));
    }

    /**
     * 创建弹窗 DOM
     * @param view 编辑器视图
     * @param triggerPos 触发位置
     */
    private createPopup(view: EditorView, triggerPos: number): void {
        // 获取光标位置的坐标
        const coords = view.coordsAtPos(triggerPos);
        if (!coords) return;
        
        // 创建容器
        this.container = document.createElement('div');
        this.container.className = 'screenplay-character-popup';
        
        // 设置位置
        this.container.style.position = 'fixed';
        this.container.style.left = `${coords.left}px`;
        this.container.style.top = `${coords.bottom + 4}px`;
        this.container.style.zIndex = '1000';
        
        // 渲染内容
        this.renderPopupContent();
        
        // 添加到文档
        document.body.appendChild(this.container);
        
        // 点击外部关闭
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick);
        }, 0);
    }

    /**
     * 渲染弹窗内容
     */
    private renderPopupContent(): void {
        if (!this.container) return;
        
        this.container.innerHTML = '';
        
        // 标题
        const header = document.createElement('div');
        header.className = 'screenplay-popup-header';
        header.textContent = this.isSpecialTypeMode ? '选择台词类型' : '选择角色';
        this.container.appendChild(header);
        
        // 列表
        const list = document.createElement('div');
        list.className = 'screenplay-popup-list';
        
        this.items.forEach((item, index) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'screenplay-popup-item';
            if (index === this.selectedIndex) {
                itemEl.classList.add('selected');
            }
            itemEl.textContent = item.name;
            
            // 点击选择
            itemEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectedIndex = index;
                this.selectCurrent();
            });
            
            // 鼠标悬停高亮
            itemEl.addEventListener('mouseenter', () => {
                this.selectedIndex = index;
                this.updateSelection();
            });
            
            list.appendChild(itemEl);
        });
        
        this.container.appendChild(list);
        
        // 提示
        const hint = document.createElement('div');
        hint.className = 'screenplay-popup-hint';
        hint.textContent = '↑↓ 选择 · Enter 确认 · Esc 取消';
        this.container.appendChild(hint);
    }

    /**
     * 更新弹窗内容（用于切换模式）
     */
    private updatePopupContent(): void {
        this.renderPopupContent();
    }

    /**
     * 更新选中状态
     */
    private updateSelection(): void {
        if (!this.container) return;
        
        const items = this.container.querySelectorAll('.screenplay-popup-item');
        items.forEach((item, index) => {
            if (index === this.selectedIndex) {
                item.classList.add('selected');
                // 确保选中项可见
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
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectCurrent();
                    break;
                case 'Tab':
                    // Tab 直接选择普通格式
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectNormal();
                    break;
                case 'Escape':
                    e.preventDefault();
                    e.stopPropagation();
                    this.hide();
                    break;
            }
        };
        
        // 使用捕获阶段，确保优先处理
        document.addEventListener('keydown', this.keydownHandler, true);
    }

    /**
     * 处理点击外部关闭
     */
    private handleOutsideClick = (e: MouseEvent): void => {
        if (this.container && !this.container.contains(e.target as Node)) {
            this.hide();
            document.removeEventListener('click', this.handleOutsideClick);
        }
    };

    /**
     * 显示无角色提示
     * @param view 编辑器视图
     * @param triggerPos 触发位置
     */
    private showNoCharactersMessage(view: EditorView, triggerPos: number): void {
        const coords = view.coordsAtPos(triggerPos);
        if (!coords) return;
        
        // 创建提示容器
        this.container = document.createElement('div');
        this.container.className = 'screenplay-character-popup screenplay-popup-empty';
        
        this.container.style.position = 'fixed';
        this.container.style.left = `${coords.left}px`;
        this.container.style.top = `${coords.bottom + 4}px`;
        this.container.style.zIndex = '1000';
        
        const message = document.createElement('div');
        message.className = 'screenplay-popup-message';
        message.textContent = '尚未定义角色，请在设定面板中添加角色';
        this.container.appendChild(message);
        
        document.body.appendChild(this.container);
        
        // 3秒后自动关闭
        setTimeout(() => {
            this.hide();
        }, 3000);
        
        // 点击关闭
        document.addEventListener('click', this.handleOutsideClick);
    }
}

/**
 * 全局角色选择弹窗实例
 */
export const characterPopup = new CharacterPopup();
