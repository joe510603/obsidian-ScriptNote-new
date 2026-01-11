/**
 * ScriptNote - AI 辅助生成服务
 * 提供 AI 生成故事梗概、人物设定、大纲等功能
 */

import { AIConfig, GenerationRequest, ProjectSettings } from '../types';
import { ERROR_MESSAGES } from '../utils/constants';

/**
 * AI 生成结果
 */
export interface AIGenerationResult {
    success: boolean;
    content?: string;
    error?: string;
}

/**
 * AI 服务类
 * 负责与 AI API 交互，生成剧本相关内容
 */
export class AIService {
    /** AI 配置 */
    private config: AIConfig = {
        apiKey: '',
        endpoint: '',
        model: ''
    };

    /**
     * 配置 AI 服务
     * @param config AI 配置
     */
    configure(config: AIConfig): void {
        this.config = { ...config };
    }

    /**
     * 获取当前配置
     * @returns AI 配置
     */
    getConfig(): AIConfig {
        return { ...this.config };
    }

    /**
     * 检查服务是否已配置
     * @returns 是否已配置
     */
    isConfigured(): boolean {
        return !!(this.config.apiKey && this.config.endpoint && this.config.model);
    }

    /**
     * 检查服务可用性
     * @returns 服务是否可用
     */
    async checkAvailability(): Promise<boolean> {
        if (!this.isConfigured()) {
            return false;
        }

        try {
            // 发送一个简单的测试请求
            const response = await this.sendRequest('测试连接', 10);
            return response.success;
        } catch {
            return false;
        }
    }

    /**
     * 生成内容
     * @param request 生成请求
     * @param settings 项目设定（用于提供上下文）
     * @returns 生成结果
     */
    async generate(
        request: GenerationRequest,
        settings?: ProjectSettings | null
    ): Promise<AIGenerationResult> {
        // 检查配置
        if (!this.isConfigured()) {
            return {
                success: false,
                error: ERROR_MESSAGES.AI_SERVICE_UNAVAILABLE.message + '：' + 
                       '请先在设置中配置 AI 服务'
            };
        }

        // 构建提示词
        const prompt = this.buildPrompt(request, settings);

        // 发送请求
        return await this.sendRequest(prompt);
    }

    /**
     * 构建提示词
     * @param request 生成请求
     * @param settings 项目设定
     * @returns 完整的提示词
     */
    private buildPrompt(
        request: GenerationRequest,
        settings?: ProjectSettings | null
    ): string {
        const contextParts: string[] = [];

        // 添加项目上下文
        if (settings) {
            if (settings.title) {
                contextParts.push(`剧名：${settings.title}`);
            }
            if (settings.synopsis && request.type !== 'synopsis') {
                contextParts.push(`故事梗概：${settings.synopsis}`);
            }
            if (settings.characters.length > 0 && request.type !== 'character') {
                const charNames = settings.characters.map(c => c.name).join('、');
                contextParts.push(`已有角色：${charNames}`);
            }
            if (settings.outline && request.type !== 'outline') {
                contextParts.push(`大纲：${settings.outline}`);
            }
        }

        // 添加用户提供的上下文
        if (request.context) {
            contextParts.push(`参考内容：${request.context}`);
        }

        // 构建系统提示
        const systemPrompt = this.getSystemPrompt(request.type);

        // 构建用户提示
        let userPrompt = '';
        
        if (contextParts.length > 0) {
            userPrompt += '【背景信息】\n' + contextParts.join('\n') + '\n\n';
        }

        // 添加具体任务
        userPrompt += '【任务】\n' + this.getTaskPrompt(request.type);

        // 添加用户自定义提示
        if (request.prompt) {
            userPrompt += '\n\n【额外要求】\n' + request.prompt;
        }

        return systemPrompt + '\n\n' + userPrompt;
    }

    /**
     * 获取系统提示词
     * @param type 生成类型
     * @returns 系统提示词
     */
    private getSystemPrompt(type: GenerationRequest['type']): string {
        const basePrompt = '你是一位专业的短剧编剧助手，擅长创作引人入胜的短剧剧本。';
        
        switch (type) {
            case 'synopsis':
                return basePrompt + '你需要帮助用户创作故事梗概，要求情节紧凑、冲突明确、有吸引力。';
            case 'character':
                return basePrompt + '你需要帮助用户设计角色，要求人物形象鲜明、性格立体、有记忆点。';
            case 'outline':
                return basePrompt + '你需要帮助用户创作剧本大纲，要求结构清晰、节奏合理、高潮迭起。';
            default:
                return basePrompt;
        }
    }

    /**
     * 获取任务提示词
     * @param type 生成类型
     * @returns 任务提示词
     */
    private getTaskPrompt(type: GenerationRequest['type']): string {
        switch (type) {
            case 'synopsis':
                return '请根据以上信息，创作一个简洁有力的故事梗概（200-500字）。' +
                       '要求包含：主要人物、核心冲突、故事走向。';
            case 'character':
                return '请根据以上信息，设计8-10个角色（包括主角、配角、反派等）。' +
                       '每个角色要求包含：角色名称、性格特点（3-5个关键词）、人物简介（30-50字）。' +
                       '请严格按以下格式输出每个角色，角色之间用空行分隔：\n\n' +
                       '角色名：xxx\n' +
                       '描述：xxx\n' +
                       '性格特点：xxx、xxx、xxx\n\n' +
                       '角色名：xxx\n' +
                       '描述：xxx\n' +
                       '性格特点：xxx、xxx、xxx\n\n' +
                       '...（继续列出其他角色）';
            case 'outline':
                return '请根据以上信息，创作一个详细的剧本大纲。' +
                       '要求按集划分，每集包含主要场景和剧情要点。' +
                       '格式示例：\n' +
                       '第1集：xxx\n' +
                       '- 场景1：xxx\n' +
                       '- 场景2：xxx\n' +
                       '第2集：xxx\n' +
                       '...';
            default:
                return '请根据以上信息进行创作。';
        }
    }

    /**
     * 发送 API 请求
     * @param prompt 提示词
     * @param maxTokens 最大 token 数（可选）
     * @returns 生成结果
     */
    private async sendRequest(
        prompt: string,
        maxTokens: number = 2000
    ): Promise<AIGenerationResult> {
        try {
            // 构建请求体（兼容 OpenAI API 格式）
            const requestBody = {
                model: this.config.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: maxTokens,
                temperature: 0.7
            };

            // 发送请求
            const response = await fetch(this.config.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            // 检查响应状态
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `API 请求失败 (${response.status})`;
                
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.error?.message) {
                        errorMessage = errorJson.error.message;
                    }
                } catch {
                    // 忽略 JSON 解析错误
                }

                return {
                    success: false,
                    error: errorMessage
                };
            }

            // 解析响应
            const data = await response.json();
            
            // 提取生成的内容（兼容 OpenAI API 格式）
            const content = data.choices?.[0]?.message?.content || 
                           data.choices?.[0]?.text ||
                           data.content ||
                           '';

            if (!content) {
                return {
                    success: false,
                    error: 'AI 返回了空内容'
                };
            }

            return {
                success: true,
                content: content.trim()
            };

        } catch (error) {
            // 处理网络错误等
            const errorMessage = error instanceof Error 
                ? error.message 
                : '未知错误';

            return {
                success: false,
                error: `请求失败：${errorMessage}`
            };
        }
    }

    /**
     * 解析角色生成结果（单个角色）
     * 从 AI 生成的文本中提取角色信息
     * @param content AI 生成的内容
     * @returns 解析后的角色信息
     */
    parseCharacterResult(content: string): {
        name: string;
        description: string;
        traits: string[];
    } | null {
        // 尝试解析多个角色，返回第一个
        const characters = this.parseMultipleCharacters(content);
        return characters.length > 0 ? characters[0] : null;
    }

    /**
     * 解析多个角色生成结果
     * 从 AI 生成的文本中提取多个角色信息
     * @param content AI 生成的内容
     * @returns 解析后的角色信息数组
     */
    parseMultipleCharacters(content: string): Array<{
        name: string;
        description: string;
        traits: string[];
    }> {
        const characters: Array<{
            name: string;
            description: string;
            traits: string[];
        }> = [];

        try {
            // 按"角色名"分割内容
            const sections = content.split(/(?=角色名[：:])/);
            
            for (const section of sections) {
                if (!section.trim()) continue;
                
                const lines = section.split('\n').map(l => l.trim()).filter(l => l);
                
                let name = '';
                let description = '';
                let traits: string[] = [];

                for (const line of lines) {
                    // 匹配角色名
                    const nameMatch = line.match(/^角色名[：:]\s*(.+)$/);
                    if (nameMatch) {
                        name = nameMatch[1].trim();
                        continue;
                    }

                    // 匹配描述
                    const descMatch = line.match(/^描述[：:]\s*(.+)$/);
                    if (descMatch) {
                        description = descMatch[1].trim();
                        continue;
                    }

                    // 匹配性格特点
                    const traitsMatch = line.match(/^性格特点[：:]\s*(.+)$/);
                    if (traitsMatch) {
                        traits = traitsMatch[1]
                            .split(/[,，、]/)
                            .map(t => t.trim())
                            .filter(t => t);
                        continue;
                    }
                }

                // 如果成功解析到角色名，添加到列表
                if (name) {
                    characters.push({ name, description, traits });
                }
            }

            return characters;

        } catch {
            return [];
        }
    }
}
