/**
 * ScriptNote - 插件设置页面
 * 提供全局设置配置界面，包括 AI 服务配置
 */

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type ScreenplayPlugin from '../main';

/**
 * AI 服务商预设配置
 */
interface AIProviderPreset {
    name: string;
    endpoint: string;
    models: string[];
    defaultModel: string;
}

/**
 * 预设的 AI 服务商列表
 */
const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
    {
        name: 'DeepSeek',
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        models: ['deepseek-chat', 'deepseek-coder'],
        defaultModel: 'deepseek-chat'
    },
    {
        name: '硅基流动 (SiliconFlow)',
        endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
        models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct', 'THUDM/glm-4-9b-chat'],
        defaultModel: 'deepseek-ai/DeepSeek-V3'
    },
    {
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        defaultModel: 'gpt-4o-mini'
    },
    {
        name: '智谱 AI (Zhipu)',
        endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        models: ['glm-4-plus', 'glm-4', 'glm-4-flash'],
        defaultModel: 'glm-4-flash'
    },
    {
        name: '月之暗面 (Moonshot)',
        endpoint: 'https://api.moonshot.cn/v1/chat/completions',
        models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
        defaultModel: 'moonshot-v1-8k'
    },
    {
        name: '百川 AI (Baichuan)',
        endpoint: 'https://api.baichuan-ai.com/v1/chat/completions',
        models: ['Baichuan4', 'Baichuan3-Turbo', 'Baichuan2-Turbo'],
        defaultModel: 'Baichuan4'
    },
    {
        name: '阿里云百炼 (Aliyun)',
        endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        models: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
        defaultModel: 'qwen-turbo'
    },
    {
        name: '自定义',
        endpoint: '',
        models: [],
        defaultModel: ''
    }
];

/**
 * 插件设置页面类
 * 继承 PluginSettingTab 创建设置界面
 */
export class ScreenplaySettingTab extends PluginSettingTab {
    /** 插件实例引用 */
    plugin: ScreenplayPlugin;

    /**
     * 构造函数
     * @param app Obsidian App 实例
     * @param plugin 插件实例
     */
    constructor(app: App, plugin: ScreenplayPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * 显示设置界面
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // 设置页面标题
        containerEl.createEl('h2', { text: 'ScriptNote 设置' });

        // 剧本项目管理区域（最常用，放最前面）
        this.renderProjectManagement(containerEl);

        // 功能开关区域
        this.renderFeatureToggles(containerEl);

        // 快捷键设置区域
        this.renderHotkeySettings(containerEl);

        // 导出配置区域
        this.renderExportSettings(containerEl);

        // 默认预设配置区域
        this.renderDefaultPresets(containerEl);

        // AI 服务配置区域（高级功能，放最后）
        this.renderAISettings(containerEl);
    }

    /**
     * 渲染剧本项目管理区域
     * @param containerEl 容器元素
     */
    private renderProjectManagement(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '剧本项目' });

        // 说明
        const descEl = containerEl.createEl('p', { 
            cls: 'setting-item-description' 
        });
        descEl.innerHTML = '已注册的剧本项目文件夹。可以在侧边面板中添加新项目。';

        // 显示已注册的项目列表
        const projects = this.plugin.globalSettings.screenplayProjects || [];
        
        if (projects.length === 0) {
            new Setting(containerEl)
                .setName('暂无剧本项目')
                .setDesc('在侧边面板中点击"添加剧本项目"来创建');
        } else {
            for (const project of projects) {
                new Setting(containerEl)
                    .setName(project)
                    .setDesc('剧本项目文件夹')
                    .addButton(button => button
                        .setButtonText('移除')
                        .setWarning()
                        .onClick(async () => {
                            const index = this.plugin.globalSettings.screenplayProjects.indexOf(project);
                            if (index > -1) {
                                this.plugin.globalSettings.screenplayProjects.splice(index, 1);
                                await this.plugin.saveSettings();
                                this.display();
                            }
                        }));
            }
        }
    }

    /**
     * 渲染 AI 服务配置区域
     * @param containerEl 容器元素
     */
    private renderAISettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'AI 服务配置' });

        // AI 服务说明
        const descEl = containerEl.createEl('p', { 
            cls: 'setting-item-description' 
        });
        descEl.innerHTML = '配置 AI 服务以启用智能生成功能。支持多种 OpenAI API 兼容的服务。';

        // 服务商预设选择
        new Setting(containerEl)
            .setName('服务商预设')
            .setDesc('选择 AI 服务商，将自动填充 API 地址和推荐模型')
            .addDropdown(dropdown => {
                // 添加所有预设选项
                for (const preset of AI_PROVIDER_PRESETS) {
                    dropdown.addOption(preset.name, preset.name);
                }
                
                // 根据当前 endpoint 设置选中项
                const currentEndpoint = this.plugin.globalSettings.aiEndpoint;
                const matchedPreset = AI_PROVIDER_PRESETS.find(p => p.endpoint === currentEndpoint);
                dropdown.setValue(matchedPreset?.name || '自定义');
                
                dropdown.onChange(async (value) => {
                    const preset = AI_PROVIDER_PRESETS.find(p => p.name === value);
                    if (preset && preset.name !== '自定义') {
                        this.plugin.globalSettings.aiEndpoint = preset.endpoint;
                        this.plugin.globalSettings.aiModel = preset.defaultModel;
                        await this.plugin.saveSettings();
                        this.updateAIServiceConfig();
                        // 刷新设置页面以更新显示
                        this.display();
                    }
                });
            });

        // API Endpoint 配置
        new Setting(containerEl)
            .setName('API Endpoint')
            .setDesc('AI 服务的 API 地址。选择预设后自动填充，也可手动修改。')
            .addText(text => text
                .setPlaceholder('https://api.deepseek.com/v1/chat/completions')
                .setValue(this.plugin.globalSettings.aiEndpoint)
                .onChange(async (value) => {
                    this.plugin.globalSettings.aiEndpoint = value.trim();
                    await this.plugin.saveSettings();
                    this.updateAIServiceConfig();
                }));

        // API Key 配置
        new Setting(containerEl)
            .setName('API Key')
            .setDesc('AI 服务的 API 密钥。请在对应服务商官网获取。')
            .addText(text => {
                text
                    .setPlaceholder('sk-...')
                    .setValue(this.plugin.globalSettings.aiApiKey)
                    .onChange(async (value) => {
                        this.plugin.globalSettings.aiApiKey = value.trim();
                        await this.plugin.saveSettings();
                        this.updateAIServiceConfig();
                    });
                // 设置为密码类型
                text.inputEl.type = 'password';
            });

        // Model 配置 - 根据当前服务商显示推荐模型
        const currentEndpoint = this.plugin.globalSettings.aiEndpoint;
        const matchedPreset = AI_PROVIDER_PRESETS.find(p => p.endpoint === currentEndpoint);
        
        const modelSetting = new Setting(containerEl)
            .setName('模型名称')
            .setDesc('使用的 AI 模型。可从下拉列表选择或手动输入。');
        
        // 如果有匹配的预设且有推荐模型，显示下拉选择
        if (matchedPreset && matchedPreset.models.length > 0) {
            modelSetting.addDropdown(dropdown => {
                for (const model of matchedPreset.models) {
                    dropdown.addOption(model, model);
                }
                // 添加自定义选项
                dropdown.addOption('__custom__', '自定义...');
                
                const currentModel = this.plugin.globalSettings.aiModel;
                if (matchedPreset.models.includes(currentModel)) {
                    dropdown.setValue(currentModel);
                } else {
                    dropdown.setValue('__custom__');
                }
                
                dropdown.onChange(async (value) => {
                    if (value !== '__custom__') {
                        this.plugin.globalSettings.aiModel = value;
                        await this.plugin.saveSettings();
                        this.updateAIServiceConfig();
                    }
                    // 刷新以显示/隐藏自定义输入框
                    this.display();
                });
            });
            
            // 如果选择了自定义或当前模型不在列表中，显示输入框
            const currentModel = this.plugin.globalSettings.aiModel;
            if (!matchedPreset.models.includes(currentModel)) {
                modelSetting.addText(text => text
                    .setPlaceholder('输入自定义模型名称')
                    .setValue(currentModel)
                    .onChange(async (value) => {
                        this.plugin.globalSettings.aiModel = value.trim();
                        await this.plugin.saveSettings();
                        this.updateAIServiceConfig();
                    }));
            }
        } else {
            // 没有预设，直接显示输入框
            modelSetting.addText(text => text
                .setPlaceholder('deepseek-chat')
                .setValue(this.plugin.globalSettings.aiModel)
                .onChange(async (value) => {
                    this.plugin.globalSettings.aiModel = value.trim();
                    await this.plugin.saveSettings();
                    this.updateAIServiceConfig();
                }));
        }

        // 测试连接按钮
        new Setting(containerEl)
            .setName('测试连接')
            .setDesc('测试 AI 服务是否可用')
            .addButton(button => button
                .setButtonText('测试')
                .onClick(async () => {
                    button.setButtonText('测试中...');
                    button.setDisabled(true);
                    
                    try {
                        const isAvailable = await this.plugin.aiService.checkAvailability();
                        if (isAvailable) {
                            new Notice('✅ AI 服务连接成功');
                        } else {
                            new Notice('❌ AI 服务连接失败，请检查配置');
                        }
                    } catch (error) {
                        new Notice('❌ 测试失败：' + (error instanceof Error ? error.message : '未知错误'));
                    } finally {
                        button.setButtonText('测试');
                        button.setDisabled(false);
                    }
                }));
    }

    /**
     * 渲染功能开关区域
     * @param containerEl 容器元素
     */
    private renderFeatureToggles(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '功能开关' });

        // 智能回车开关
        new Setting(containerEl)
            .setName('智能回车')
            .setDesc('按回车后自动在新行插入 △ 动作描述符号，方便快速输入动作描述')
            .addToggle(toggle => toggle
                .setValue(this.plugin.globalSettings.autoInsertTriangle)
                .onChange(async (value) => {
                    this.plugin.globalSettings.autoInsertTriangle = value;
                    await this.plugin.saveSettings();
                }));

        // @ 人物选择（v1.1.0 新功能）
        new Setting(containerEl)
            .setName('@ 人物快速选择')
            .setDesc('输入 @ 时显示人物选择弹窗（从文档的「人物：」行自动提取），选择后自动添加冒号')
            .addToggle(toggle => toggle
                .setValue(this.plugin.globalSettings.enableCharacterPopup)
                .onChange(async (value) => {
                    this.plugin.globalSettings.enableCharacterPopup = value;
                    await this.plugin.saveSettings();
                }));

        // 修饰符选择快捷键配置（v1.1.0 新功能）
        this.renderModifierHotkeySettings(containerEl);
    }

    /**
     * 渲染修饰符选择快捷键设置
     * @param containerEl 容器元素
     */
    private renderModifierHotkeySettings(containerEl: HTMLElement): void {
        // 确保 modifierHotkey 存在
        if (!this.plugin.globalSettings.modifierHotkey) {
            this.plugin.globalSettings.modifierHotkey = {
                key: 'Tab',
                altKey: true,
                ctrlKey: false,
                shiftKey: false,
                metaKey: false
            };
        }

        const hotkey = this.plugin.globalSettings.modifierHotkey;
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

        // 获取当前快捷键显示文本
        const getHotkeyText = (): string => {
            const parts: string[] = [];
            if (hotkey.ctrlKey) parts.push('Ctrl');
            if (hotkey.altKey) parts.push(isMac ? 'Option' : 'Alt');
            if (hotkey.shiftKey) parts.push('Shift');
            if (hotkey.metaKey) parts.push(isMac ? 'Cmd' : 'Win');
            parts.push(hotkey.key);
            return parts.join(' + ');
        };

        const setting = new Setting(containerEl)
            .setName('台词修饰符选择快捷键')
            .setDesc(`当前：${getHotkeyText()}。在人物名或冒号后按此快捷键弹出修饰符选择（OS、VO、自定义情绪等）`);

        // 修饰键选择
        setting.addToggle(toggle => {
            toggle.setTooltip(isMac ? 'Option' : 'Alt');
            toggle.setValue(hotkey.altKey);
            toggle.onChange(async (value) => {
                hotkey.altKey = value;
                await this.plugin.saveSettings();
                this.display();
            });
        });

        setting.addToggle(toggle => {
            toggle.setTooltip('Ctrl');
            toggle.setValue(hotkey.ctrlKey);
            toggle.onChange(async (value) => {
                hotkey.ctrlKey = value;
                await this.plugin.saveSettings();
                this.display();
            });
        });

        setting.addToggle(toggle => {
            toggle.setTooltip('Shift');
            toggle.setValue(hotkey.shiftKey);
            toggle.onChange(async (value) => {
                hotkey.shiftKey = value;
                await this.plugin.saveSettings();
                this.display();
            });
        });

        // 主键选择
        setting.addDropdown(dropdown => {
            const keyOptions = ['Tab', 'Space', 'Enter', '/', '\\', ';', "'", ',', '.'];
            for (const key of keyOptions) {
                dropdown.addOption(key, key);
            }
            dropdown.setValue(hotkey.key);
            dropdown.onChange(async (value) => {
                hotkey.key = value;
                await this.plugin.saveSettings();
                this.display();
            });
        });
    }

    /**
     * 渲染快捷键设置区域
     * @param containerEl 容器元素
     */
    private renderHotkeySettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '快捷键' });

        // 说明
        const descEl = containerEl.createEl('p', { 
            cls: 'setting-item-description' 
        });
        descEl.innerHTML = 'ScriptNote 提供以下命令，可在 Obsidian 快捷键设置中绑定快捷键：';

        // 命令列表
        const commandList = [
            { id: 'insert-scene', name: '插入场景' },
            { id: 'new-episode', name: '新建一集' },
            { id: 'insert-action', name: '插入动作描述 △' },
            { id: 'insert-flashback', name: '插入闪回' },
            { id: 'end-flashback', name: '结束闪回' },
            { id: 'insert-os', name: '插入旁白（OS）' },
            { id: 'insert-narrator', name: '插入【旁白】' },
            { id: 'insert-vo', name: '插入内心独白（VO）' }
        ];

        // 显示命令列表
        const listEl = containerEl.createEl('ul', { cls: 'scriptnote-command-list' });
        for (const cmd of commandList) {
            listEl.createEl('li', { text: cmd.name });
        }

        // 跳转到快捷键设置按钮
        new Setting(containerEl)
            .setName('配置快捷键')
            .setDesc('点击跳转到 Obsidian 快捷键设置，自动筛选 ScriptNote 命令')
            .addButton(button => button
                .setButtonText('打开快捷键设置')
                .setCta()
                .onClick(() => {
                    // 打开 Obsidian 设置并跳转到快捷键页面
                    // @ts-ignore - 使用内部 API
                    this.app.setting.open();
                    // @ts-ignore - 使用内部 API
                    this.app.setting.openTabById('hotkeys');
                    
                    // 延迟设置搜索框内容，等待页面加载
                    setTimeout(() => {
                        // @ts-ignore - 使用内部 API
                        const hotkeyTab = this.app.setting.activeTab;
                        if (hotkeyTab && hotkeyTab.searchComponent) {
                            hotkeyTab.searchComponent.setValue('ScriptNote');
                            hotkeyTab.updateHotkeyVisibility();
                        }
                    }, 100);
                }));
    }

    /**
     * 渲染导出配置区域
     * @param containerEl 容器元素
     */
    private renderExportSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '导出配置' });

        // 导出模板说明
        const descEl = containerEl.createEl('p', { 
            cls: 'setting-item-description' 
        });
        descEl.innerHTML = '配置导出文件的格式和样式选项。';

        // 默认导出模板选择
        new Setting(containerEl)
            .setName('默认导出模板')
            .setDesc('选择导出时使用的默认模板样式')
            .addDropdown(dropdown => {
                dropdown.addOption('standard', '标准格式');
                dropdown.addOption('compact', '紧凑格式');
                dropdown.addOption('detailed', '详细格式（含统计）');
                
                dropdown.setValue(this.plugin.globalSettings.defaultExportTemplate || 'standard');
                
                dropdown.onChange(async (value) => {
                    this.plugin.globalSettings.defaultExportTemplate = value;
                    await this.plugin.saveSettings();
                });
            });

        // 导出时包含设定信息
        new Setting(containerEl)
            .setName('导出时包含设定')
            .setDesc('在导出文件中包含剧名、梗概等设定信息')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.globalSettings.exportIncludeSettings ?? true);
                
                toggle.onChange(async (value) => {
                    this.plugin.globalSettings.exportIncludeSettings = value;
                    await this.plugin.saveSettings();
                });
            });

        // 分场表包含时长估算
        new Setting(containerEl)
            .setName('分场表包含时长')
            .setDesc('在分场表中显示每场戏的预估时长')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.globalSettings.breakdownIncludeDuration ?? true);
                
                toggle.onChange(async (value) => {
                    this.plugin.globalSettings.breakdownIncludeDuration = value;
                    await this.plugin.saveSettings();
                });
            });

        // Word 导出格式设置
        this.renderExportFormatSettings(containerEl);
    }

    /**
     * 渲染 Word 导出格式设置
     * @param containerEl 容器元素
     */
    private renderExportFormatSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h4', { text: 'Word 导出格式' });

        // 确保 exportFormat 存在
        if (!this.plugin.globalSettings.exportFormat) {
            this.plugin.globalSettings.exportFormat = {
                episodeTitle: { font: 'SimHei', size: 16, bold: true, center: true },
                sceneHeader: { font: 'SimHei', size: 12, bold: true },
                body: { font: 'SimSun', size: 12 },
                characterName: { font: 'SimSun', size: 12, bold: true },
                action: { font: 'KaiTi', size: 12 }
            };
        }

        const format = this.plugin.globalSettings.exportFormat;

        // 字体选项
        const fontOptions = [
            { value: 'SimHei', label: '黑体' },
            { value: 'SimSun', label: '宋体' },
            { value: 'KaiTi', label: '楷体' },
            { value: 'Microsoft YaHei', label: '微软雅黑' },
            { value: 'FangSong', label: '仿宋' }
        ];

        // 字号选项
        const sizeOptions = ['10', '11', '12', '14', '16', '18', '20', '22', '24'];

        // 集标题格式
        new Setting(containerEl)
            .setName('集标题')
            .setDesc('如：第1集')
            .addDropdown(dropdown => {
                for (const opt of fontOptions) {
                    dropdown.addOption(opt.value, opt.label);
                }
                dropdown.setValue(format.episodeTitle.font);
                dropdown.onChange(async (value) => {
                    format.episodeTitle.font = value;
                    await this.plugin.saveSettings();
                });
            })
            .addDropdown(dropdown => {
                for (const size of sizeOptions) {
                    dropdown.addOption(size, size + 'pt');
                }
                dropdown.setValue(String(format.episodeTitle.size));
                dropdown.onChange(async (value) => {
                    format.episodeTitle.size = parseInt(value);
                    await this.plugin.saveSettings();
                });
            })
            .addToggle(toggle => {
                toggle.setTooltip('加粗');
                toggle.setValue(format.episodeTitle.bold);
                toggle.onChange(async (value) => {
                    format.episodeTitle.bold = value;
                    await this.plugin.saveSettings();
                });
            })
            .addToggle(toggle => {
                toggle.setTooltip('居中');
                toggle.setValue(format.episodeTitle.center);
                toggle.onChange(async (value) => {
                    format.episodeTitle.center = value;
                    await this.plugin.saveSettings();
                });
            });

        // 场景头格式
        new Setting(containerEl)
            .setName('场景头')
            .setDesc('如：1-1 日 内 客厅')
            .addDropdown(dropdown => {
                for (const opt of fontOptions) {
                    dropdown.addOption(opt.value, opt.label);
                }
                dropdown.setValue(format.sceneHeader.font);
                dropdown.onChange(async (value) => {
                    format.sceneHeader.font = value;
                    await this.plugin.saveSettings();
                });
            })
            .addDropdown(dropdown => {
                for (const size of sizeOptions) {
                    dropdown.addOption(size, size + 'pt');
                }
                dropdown.setValue(String(format.sceneHeader.size));
                dropdown.onChange(async (value) => {
                    format.sceneHeader.size = parseInt(value);
                    await this.plugin.saveSettings();
                });
            })
            .addToggle(toggle => {
                toggle.setTooltip('加粗');
                toggle.setValue(format.sceneHeader.bold);
                toggle.onChange(async (value) => {
                    format.sceneHeader.bold = value;
                    await this.plugin.saveSettings();
                });
            });

        // 正文/台词格式
        new Setting(containerEl)
            .setName('正文/台词')
            .setDesc('角色台词内容')
            .addDropdown(dropdown => {
                for (const opt of fontOptions) {
                    dropdown.addOption(opt.value, opt.label);
                }
                dropdown.setValue(format.body.font);
                dropdown.onChange(async (value) => {
                    format.body.font = value;
                    await this.plugin.saveSettings();
                });
            })
            .addDropdown(dropdown => {
                for (const size of sizeOptions) {
                    dropdown.addOption(size, size + 'pt');
                }
                dropdown.setValue(String(format.body.size));
                dropdown.onChange(async (value) => {
                    format.body.size = parseInt(value);
                    await this.plugin.saveSettings();
                });
            });

        // 角色名格式
        new Setting(containerEl)
            .setName('角色名')
            .setDesc('台词前的角色名')
            .addDropdown(dropdown => {
                for (const opt of fontOptions) {
                    dropdown.addOption(opt.value, opt.label);
                }
                dropdown.setValue(format.characterName.font);
                dropdown.onChange(async (value) => {
                    format.characterName.font = value;
                    await this.plugin.saveSettings();
                });
            })
            .addDropdown(dropdown => {
                for (const size of sizeOptions) {
                    dropdown.addOption(size, size + 'pt');
                }
                dropdown.setValue(String(format.characterName.size));
                dropdown.onChange(async (value) => {
                    format.characterName.size = parseInt(value);
                    await this.plugin.saveSettings();
                });
            })
            .addToggle(toggle => {
                toggle.setTooltip('加粗');
                toggle.setValue(format.characterName.bold);
                toggle.onChange(async (value) => {
                    format.characterName.bold = value;
                    await this.plugin.saveSettings();
                });
            });

        // 动作描述格式
        new Setting(containerEl)
            .setName('动作描述')
            .setDesc('△ 开头的动作描述')
            .addDropdown(dropdown => {
                for (const opt of fontOptions) {
                    dropdown.addOption(opt.value, opt.label);
                }
                dropdown.setValue(format.action.font);
                dropdown.onChange(async (value) => {
                    format.action.font = value;
                    await this.plugin.saveSettings();
                });
            })
            .addDropdown(dropdown => {
                for (const size of sizeOptions) {
                    dropdown.addOption(size, size + 'pt');
                }
                dropdown.setValue(String(format.action.size));
                dropdown.onChange(async (value) => {
                    format.action.size = parseInt(value);
                    await this.plugin.saveSettings();
                });
            });

        // 恢复默认按钮
        new Setting(containerEl)
            .setName('恢复默认格式')
            .setDesc('将所有导出格式恢复为默认值')
            .addButton(button => button
                .setButtonText('恢复默认')
                .onClick(async () => {
                    this.plugin.globalSettings.exportFormat = {
                        episodeTitle: { font: 'SimHei', size: 16, bold: true, center: true },
                        sceneHeader: { font: 'SimHei', size: 12, bold: true },
                        body: { font: 'SimSun', size: 12 },
                        characterName: { font: 'SimSun', size: 12, bold: true },
                        action: { font: 'KaiTi', size: 12 }
                    };
                    await this.plugin.saveSettings();
                    this.display();
                    new Notice('已恢复默认导出格式');
                }));
    }

    /**
     * 渲染默认预设配置区域
     * @param containerEl 容器元素
     */
    private renderDefaultPresets(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '默认预设' });

        // 时间预设配置
        new Setting(containerEl)
            .setName('时间预设')
            .setDesc('默认的时间选项（用逗号分隔）')
            .addText(text => text
                .setPlaceholder('日, 夜, 雨夜, 雪夜')
                .setValue(this.plugin.globalSettings.defaultTimePresets.join(', '))
                .onChange(async (value) => {
                    const presets = value
                        .split(/[,，]/)
                        .map(s => s.trim())
                        .filter(s => s);
                    this.plugin.globalSettings.defaultTimePresets = presets;
                    await this.plugin.saveSettings();
                }));

        // 标签预设配置
        new Setting(containerEl)
            .setName('标签预设')
            .setDesc('默认的场景标签选项（用逗号分隔）')
            .addText(text => text
                .setPlaceholder('动作戏, 感情戏, 转折点, 高潮')
                .setValue(this.plugin.globalSettings.defaultTagPresets.join(', '))
                .onChange(async (value) => {
                    const presets = value
                        .split(/[,，]/)
                        .map(s => s.trim())
                        .filter(s => s);
                    this.plugin.globalSettings.defaultTagPresets = presets;
                    await this.plugin.saveSettings();
                }));

        // 地点预设配置
        new Setting(containerEl)
            .setName('地点预设')
            .setDesc('默认的地点选项（用逗号分隔）')
            .addText(text => text
                .setPlaceholder('客厅, 卧室, 办公室, 街道')
                .setValue(this.plugin.globalSettings.defaultLocationPresets.join(', '))
                .onChange(async (value) => {
                    const presets = value
                        .split(/[,，]/)
                        .map(s => s.trim())
                        .filter(s => s);
                    this.plugin.globalSettings.defaultLocationPresets = presets;
                    await this.plugin.saveSettings();
                }));
    }

    /**
     * 更新 AI 服务配置
     * 当设置变化时同步更新 AIService 的配置
     */
    private updateAIServiceConfig(): void {
        this.plugin.aiService.configure({
            apiKey: this.plugin.globalSettings.aiApiKey,
            endpoint: this.plugin.globalSettings.aiEndpoint,
            model: this.plugin.globalSettings.aiModel
        });
    }
}
