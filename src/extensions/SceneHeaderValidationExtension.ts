/**
 * ScriptNote - 场景头格式验证高亮扩展
 * 检测格式错误的场景头并在编辑器中高亮显示
 * 使用 CodeMirror 6 Decoration API
 */

import { Extension, RangeSetBuilder } from '@codemirror/state';
import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType
} from '@codemirror/view';
import { validateSceneHeader, isSceneNumberLine } from '../services/SceneService';

/**
 * 错误提示 Widget
 * 在行末显示错误信息
 */
class ErrorTooltipWidget extends WidgetType {
    constructor(private message: string) {
        super();
    }

    toDOM(): HTMLElement {
        const span = document.createElement('span');
        span.className = 'screenplay-scene-header-error-tooltip';
        span.textContent = ` ⚠ ${this.message}`;
        span.title = this.message;
        return span;
    }

    eq(other: ErrorTooltipWidget): boolean {
        return this.message === other.message;
    }
}

/**
 * 错误行装饰（背景高亮）
 */
const errorLineDecoration = Decoration.line({
    class: 'screenplay-scene-header-error-line'
});

/**
 * 错误文本装饰（下划线）
 */
const errorTextDecoration = Decoration.mark({
    class: 'screenplay-scene-header-error-text'
});

/**
 * 构建场景头验证装饰
 * @param view 编辑器视图
 * @param isEnabled 是否启用验证
 * @returns 装饰集合
 */
function buildDecorations(view: EditorView, isEnabled: boolean): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    
    // 如果未启用，返回空装饰
    if (!isEnabled) {
        return builder.finish();
    }
    
    const doc = view.state.doc;

    // 遍历所有行
    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const lineText = line.text;
        const trimmedLine = lineText.trim();

        // 检查是否是场景编号行（以数字-数字开头）
        if (!isSceneNumberLine(trimmedLine)) {
            continue;
        }

        // 验证场景头格式
        const validationResult = validateSceneHeader(trimmedLine);

        // 如果验证失败，添加装饰
        if (!validationResult.valid && validationResult.errors.length > 0) {
            // 添加行背景装饰
            builder.add(line.from, line.from, errorLineDecoration);

            // 添加文本下划线装饰（整行）
            if (lineText.length > 0) {
                builder.add(line.from, line.to, errorTextDecoration);
            }

            // 添加错误提示 Widget（在行末）
            const firstError = validationResult.errors[0];
            const errorWidget = Decoration.widget({
                widget: new ErrorTooltipWidget(firstError.message),
                side: 1 // 在位置后面显示
            });
            builder.add(line.to, line.to, errorWidget);
        }
    }

    return builder.finish();
}

/**
 * 创建场景头验证视图插件
 * @param isEnabled 获取功能是否启用的函数
 * @returns 视图插件
 */
function createSceneHeaderValidationPlugin(isEnabled: () => boolean) {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = buildDecorations(view, isEnabled());
            }

            update(update: ViewUpdate) {
                // 当文档变化或视口变化时重新构建装饰
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = buildDecorations(update.view, isEnabled());
                }
            }
        },
        {
            decorations: (v) => v.decorations
        }
    );
}

/**
 * 创建场景头验证高亮扩展
 * @param isEnabled 获取功能是否启用的函数（默认始终启用）
 * @returns CodeMirror 扩展
 */
export function createSceneHeaderValidationExtension(isEnabled: () => boolean = () => true): Extension {
    return createSceneHeaderValidationPlugin(isEnabled);
}
