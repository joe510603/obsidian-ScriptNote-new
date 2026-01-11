/**
 * ScriptNote - 事件总线
 * 组件间通信的事件总线实现
 */

import { EventType, EventHandler } from '../types';

/**
 * 事件总线类
 * 提供发布/订阅模式的事件通信机制
 */
export class EventBus {
    /** 事件处理器映射表 */
    private handlers: Map<EventType, Set<EventHandler>> = new Map();

    /**
     * 订阅事件
     * @param event 事件类型
     * @param handler 事件处理函数
     * @returns 取消订阅的函数
     */
    on<T = unknown>(event: EventType, handler: EventHandler<T>): () => void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }

        const handlers = this.handlers.get(event)!;
        handlers.add(handler as EventHandler);

        // 返回取消订阅函数
        return () => {
            this.off(event, handler);
        };
    }

    /**
     * 发布事件
     * @param event 事件类型
     * @param data 事件数据
     */
    emit<T = unknown>(event: EventType, data?: T): void {
        const handlers = this.handlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`事件处理器执行错误 [${event}]:`, error);
                }
            });
        }
    }

    /**
     * 取消订阅事件
     * @param event 事件类型
     * @param handler 事件处理函数
     */
    off<T = unknown>(event: EventType, handler: EventHandler<T>): void {
        const handlers = this.handlers.get(event);
        if (handlers) {
            handlers.delete(handler as EventHandler);
            // 如果没有处理器了，删除该事件类型
            if (handlers.size === 0) {
                this.handlers.delete(event);
            }
        }
    }

    /**
     * 订阅事件（只触发一次）
     * @param event 事件类型
     * @param handler 事件处理函数
     * @returns 取消订阅的函数
     */
    once<T = unknown>(event: EventType, handler: EventHandler<T>): () => void {
        const wrappedHandler: EventHandler<T> = (data: T) => {
            this.off(event, wrappedHandler);
            handler(data);
        };
        return this.on(event, wrappedHandler);
    }

    /**
     * 清除所有事件订阅
     */
    clear(): void {
        this.handlers.clear();
    }

    /**
     * 清除指定事件的所有订阅
     * @param event 事件类型
     */
    clearEvent(event: EventType): void {
        this.handlers.delete(event);
    }

    /**
     * 获取指定事件的订阅者数量
     * @param event 事件类型
     * @returns 订阅者数量
     */
    listenerCount(event: EventType): number {
        const handlers = this.handlers.get(event);
        return handlers ? handlers.size : 0;
    }

    /**
     * 检查是否有指定事件的订阅者
     * @param event 事件类型
     * @returns 是否有订阅者
     */
    hasListeners(event: EventType): boolean {
        return this.listenerCount(event) > 0;
    }
}
