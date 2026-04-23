// preload.js — runs in the renderer with access to ipcRenderer
// Bridges global key events + app lifecycle events into window.electronBridge

const { contextBridge, ipcRenderer } = require('electron');

// uiohook keycodes → browser-compatible e.code strings
const KEYCODE_TO_CODE = {
  1: 'Escape',
  59: 'F1', 60: 'F2', 61: 'F3', 62: 'F4',
  63: 'F5', 64: 'F6', 65: 'F7', 66: 'F8',
  67: 'F9', 68: 'F10', 87: 'F11', 88: 'F12',
  41: 'Backquote',
  2: 'Digit1', 3: 'Digit2', 4: 'Digit3', 5: 'Digit4',
  6: 'Digit5', 7: 'Digit6', 8: 'Digit7', 9: 'Digit8',
  10: 'Digit9', 11: 'Digit0',
  12: 'Minus', 13: 'Equal', 14: 'Backspace',

  15: 'Tab',
  16: 'KeyQ', 17: 'KeyW', 18: 'KeyE', 19: 'KeyR', 20: 'KeyT',
  21: 'KeyY', 22: 'KeyU', 23: 'KeyI', 24: 'KeyO', 25: 'KeyP',
  26: 'BracketLeft', 27: 'BracketRight', 43: 'Backslash',

  58: 'CapsLock',
  30: 'KeyA', 31: 'KeyS', 32: 'KeyD', 33: 'KeyF', 34: 'KeyG',
  35: 'KeyH', 36: 'KeyJ', 37: 'KeyK', 38: 'KeyL',
  39: 'Semicolon', 40: 'Quote',
  28: 'Enter',

  42: 'ShiftLeft',
  44: 'KeyZ', 45: 'KeyX', 46: 'KeyC', 47: 'KeyV', 48: 'KeyB',
  49: 'KeyN', 50: 'KeyM',
  51: 'Comma', 52: 'Period', 53: 'Slash',
  54: 'ShiftRight',

  29: 'ControlLeft',
  3675: 'MetaLeft',
  56: 'AltLeft',
  57: 'Space',
  3640: 'AltRight',
  3676: 'MetaRight',
  3613: 'ControlRight',

  3655: 'Home',
  3663: 'End',
  3657: 'PageUp',
  3665: 'PageDown',
  3666: 'Insert',
  3637: 'Delete',

  57416: 'ArrowUp',
  57424: 'ArrowDown',
  57419: 'ArrowLeft',
  57421: 'ArrowRight',
};

function onChannel(channel, handler) {
  const wrapped = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('electronBridge', {
  onGlobalKeydown: (cb) =>
    onChannel('global-keydown', (data) => {
      const code = KEYCODE_TO_CODE[data?.keycode] || 'Unidentified';
      cb({
        keycode: data?.keycode,
        code,
      });
    }),

  onGlobalKeyup: (cb) =>
    onChannel('global-keyup', (data) => {
      const code = KEYCODE_TO_CODE[data?.keycode] || 'Unidentified';
      cb({
        keycode: data?.keycode,
        code,
      });
    }),

  onAppLifecycle: (cb) =>
    onChannel('app-lifecycle', (data) => {
      cb({
        visible: !!data?.visible,
        focused: !!data?.focused,
        minimized: !!data?.minimized,
        lifecycle: data?.lifecycle || 'active',
        reason: data?.reason || 'unknown',
      });
    }),

  onSystemPower: (cb) =>
    onChannel('system-power', (data) => {
      cb({
        state: data?.state || 'unknown',
      });
    }),
});