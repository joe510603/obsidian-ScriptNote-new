/**
 * ScriptNote - 导出服务
 * 提供剧本导出功能，支持多种格式
 * 采用插件式架构，便于扩展新格式
 */

import { SceneIndex, ProjectSettings, ExportOptions, Exporter } from '../types';

/**
 * 导出服务类
 * 管理所有导出器，协调导出流程
 */
export class ExportService {
    /** 已注册的导出器映射表 */
    private exporters: Map<string, Exporter> = new Map();

    /**
     * 注册导出器
     * @param exporter 导出器实例
     */
    registerExporter(exporter: Exporter): void {
        this.exporters.set(exporter.name, exporter);
    }

    /**
     * 注销导出器
     * @param name 导出器名称
     */
    unregisterExporter(name: string): void {
        this.exporters.delete(name);
    }

    /**
     * 获取所有可用的导出器列表
     * @returns 导出器数组
     */
    getAvailableExporters(): Exporter[] {
        return Array.from(this.exporters.values());
    }

    /**
     * 获取指定名称的导出器
     * @param name 导出器名称
     * @returns 导出器实例，如果不存在返回 undefined
     */
    getExporter(name: string): Exporter | undefined {
        return this.exporters.get(name);
    }

    /**
     * 检查是否存在指定名称的导出器
     * @param name 导出器名称
     * @returns 是否存在
     */
    hasExporter(name: string): boolean {
        return this.exporters.has(name);
    }

    /**
     * 执行导出操作
     * @param exporterName 导出器名称
     * @param content 文档内容
     * @param index 场景索引
     * @param settings 项目设定
     * @param options 导出选项
     * @returns 导出的 Blob 数据
     * @throws 如果导出器不存在或导出失败
     */
    async export(
        exporterName: string,
        content: string,
        index: SceneIndex,
        settings: ProjectSettings,
        options: ExportOptions
    ): Promise<Blob> {
        const exporter = this.exporters.get(exporterName);
        
        if (!exporter) {
            throw new Error(`导出器 "${exporterName}" 不存在`);
        }

        try {
            return await exporter.export(content, index, settings, options);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            throw new Error(`导出失败: ${errorMessage}`);
        }
    }

    /**
     * 下载文件到本地
     * 创建临时链接并触发下载
     * @param blob 文件数据
     * @param filename 文件名（包含扩展名）
     */
    downloadFile(blob: Blob, filename: string): void {
        // 创建临时 URL
        const url = URL.createObjectURL(blob);
        
        // 创建隐藏的下载链接
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        // 添加到文档并触发点击
        document.body.appendChild(link);
        link.click();
        
        // 清理
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * 导出并下载文件
     * 组合导出和下载操作的便捷方法
     * @param exporterName 导出器名称
     * @param content 文档内容
     * @param index 场景索引
     * @param settings 项目设定
     * @param options 导出选项
     * @param baseFilename 基础文件名（不含扩展名）
     */
    async exportAndDownload(
        exporterName: string,
        content: string,
        index: SceneIndex,
        settings: ProjectSettings,
        options: ExportOptions,
        baseFilename: string
    ): Promise<void> {
        const exporter = this.exporters.get(exporterName);
        
        if (!exporter) {
            throw new Error(`导出器 "${exporterName}" 不存在`);
        }

        // 执行导出
        const blob = await this.export(exporterName, content, index, settings, options);
        
        // 构建完整文件名
        const filename = `${baseFilename}${exporter.extension}`;
        
        // 下载文件
        this.downloadFile(blob, filename);
    }

    /**
     * 清除所有已注册的导出器
     */
    clearExporters(): void {
        this.exporters.clear();
    }
}
