/**
 * ScriptNote - 编辑器扩展模块
 * 导出所有 CodeMirror 6 扩展
 */

export { createSmartEnterExtension, shouldInsertTriangle } from './SmartEnterExtension';
export { createCharacterPopupExtension, shouldTriggerCharacterPopup } from './CharacterPopupExtension';
export { createSceneHeaderValidationExtension } from './SceneHeaderValidationExtension';
export { createAtCharacterExtension, getAtPopup } from './AtCharacterExtension';
export { createTabModifierExtension, getTabModifierPopup, setModifierHotkey, getModifierHotkey, getModifierHotkeyText } from './TabModifierExtension';
