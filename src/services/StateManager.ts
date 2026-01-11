/**
 * ScriptNote - 状态管理器
 * 响应式状态管理，协调各组件间的状态同步
 */

import { AppState, StateListener, SceneIndex, ProjectSettings, EpisodeStats, CharacterStats } from '../types';
import { EventBus } from './EventBus';

/**
 * 创建空的场景索引
 */
function createEmptySceneIndex(): SceneIndex {
    return {
        scenes: [],
        episodeCount: 0,
        lastUpdated: Date.now(),
        contentHash: ''
    };
}

/**
 * 创建初始应用状态
 */
function createInitialState(): AppState {
    return {
        sceneIndex: createEmptySceneIndex(),
        projectSettings: null,
        stats: {
            episodeStats: [],
            characterStats: []
        },
        ui: {
            panelOpen: false,
            activeSection: 'scene'
        }
    };
}

/**
 * 状态管理器类
 * 提供响应式状态管理和状态变化通知
 */
export class StateManager {
    /** 当前应用状态 */
    private state: AppState;

    /** 状态监听器映射表（按状态键分组） */
    private listeners: Map<string, Set<StateListener>> = new Map();

    /** 全局监听器（监听所有状态变化） */
    private globalListeners: Set<StateListener> = new Set();

    /** 事件总线引用 */
    private eventBus: EventBus;

    /**
     * 构造函数
     * @param eventBus 事件总线实例
     */
    constructor(eventBus: EventBus) {
        this.state = createInitialState();
        this.eventBus = eventBus;
    }

    /**
     * 获取当前状态
     * @returns 当前应用状态的只读副本
     */
    getState(): Readonly<AppState> {
        return this.state;
    }

    /**
     * 更新状态
     * @param partial 部分状态更新
     */
    setState(partial: Partial<AppState>): void {
        const prevState = this.state;
        
        // 合并状态
        this.state = {
            ...this.state,
            ...partial
        };

        // 通知变化的状态键对应的监听器
        const changedKeys = Object.keys(partial) as (keyof AppState)[];
        changedKeys.forEach(key => {
            this.notifyListeners(key);
        });

        // 通知全局监听器
        this.notifyGlobalListeners();

        // 发送状态变更事件
        this.eventBus.emit('settings:changed', { prevState, newState: this.state });
    }

    /**
     * 更新场景索引
     * @param sceneIndex 新的场景索引
     */
    setSceneIndex(sceneIndex: SceneIndex): void {
        this.setState({ sceneIndex });
    }

    /**
     * 更新项目设定
     * @param settings 新的项目设定
     */
    setProjectSettings(settings: ProjectSettings | null): void {
        this.setState({ projectSettings: settings });
    }

    /**
     * 更新统计数据
     * @param episodeStats 每集统计
     * @param characterStats 角色统计
     */
    setStats(episodeStats: EpisodeStats[], characterStats: CharacterStats[]): void {
        this.setState({
            stats: { episodeStats, characterStats }
        });
    }

    /**
     * 更新 UI 状态
     * @param ui 部分 UI 状态更新
     */
    setUIState(ui: Partial<AppState['ui']>): void {
        this.setState({
            ui: { ...this.state.ui, ...ui }
        });
    }

    /**
     * 订阅指定状态键的变化
     * @param key 状态键
     * @param listener 监听器函数
     * @returns 取消订阅的函数
     */
    subscribe(key: keyof AppState, listener: StateListener): () => void {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }

        const listeners = this.listeners.get(key)!;
        listeners.add(listener);

        // 返回取消订阅函数
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) {
                this.listeners.delete(key);
            }
        };
    }

    /**
     * 订阅所有状态变化
     * @param listener 监听器函数
     * @returns 取消订阅的函数
     */
    subscribeAll(listener: StateListener): () => void {
        this.globalListeners.add(listener);

        return () => {
            this.globalListeners.delete(listener);
        };
    }

    /**
     * 通知指定状态键的监听器
     * @param key 状态键
     */
    private notifyListeners(key: keyof AppState): void {
        const listeners = this.listeners.get(key);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(this.state);
                } catch (error) {
                    console.error(`状态监听器执行错误 [${key}]:`, error);
                }
            });
        }
    }

    /**
     * 通知全局监听器
     */
    private notifyGlobalListeners(): void {
        this.globalListeners.forEach(listener => {
            try {
                listener(this.state);
            } catch (error) {
                console.error('全局状态监听器执行错误:', error);
            }
        });
    }

    /**
     * 文档变化时的处理
     * @param content 文档内容
     */
    onDocumentChange(content: string): void {
        // 发送文档变更事件，由 SceneService 处理解析
        this.eventBus.emit('document:changed', { content });
    }

    /**
     * 重置状态到初始值
     */
    reset(): void {
        this.state = createInitialState();
        this.notifyGlobalListeners();
    }

    /**
     * 清除所有监听器
     */
    clearListeners(): void {
        this.listeners.clear();
        this.globalListeners.clear();
    }
}
