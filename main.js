// main.js — battery-optimised Electron main process for ThockBoard

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  powerMonitor,
} = require('electron');
const path = require('path');

let mainWindow;
let tray;
let isQuitting = false;
let onBattery = false;

// ── macOS: utility-style app ────────────────────────────────
if (app.dock) app.dock.hide();

// Allow audio to play without prior user gesture
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// ── Battery: detect initial state synchronously ─────────────
// powerMonitor.getSystemIdleState requires ready, but onBattery can
// be polled after. We read it after whenReady below.

// Safely send to renderer, no-op if window is gone
function sendToRenderer(channel, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (!wc || wc.isDestroyed()) return;
  wc.send(channel, payload);
}

function getWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { visible: false, focused: false, minimized: true, lifecycle: 'hidden', onBattery };
  }
  const visible   = mainWindow.isVisible();
  const focused   = mainWindow.isFocused();
  const minimized = mainWindow.isMinimized();
  let lifecycle   = 'active';
  if (!visible)        lifecycle = 'hidden';
  else if (minimized)  lifecycle = 'minimized';
  else if (!focused)   lifecycle = 'background';
  return { visible, focused, minimized, lifecycle, onBattery };
}

function notifyRendererLifecycle(reason = 'unknown') {
  sendToRenderer('app-lifecycle', { ...getWindowState(), reason });
}

// ── Vibrancy helpers ─────────────────────────────────────────
// Disabling vibrancy when the window is hidden removes the OS-level
// blur compositor pass that runs even for invisible windows.
function enableVibrancy() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setVibrancy('under-window');
  mainWindow.setVisualEffectState('active');
}

function disableVibrancy() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setVibrancy(null);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  enableVibrancy();
  mainWindow.show();
  mainWindow.focus();
  if (app.dock) app.dock.show();
  notifyRendererLifecycle('show-window');
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
  disableVibrancy(); // stop OS blur compositor while invisible
  if (app.dock) app.dock.hide();
  notifyRendererLifecycle('hide-window');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 620,
    minWidth: 780,
    minHeight: 520,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    // 'followsWindowActiveState' stops the vibrancy compositor when the
    // window is not the active (key) window — saves GPU on every blur event.
    visualEffectState: 'followsWindowActiveState',
    backgroundColor: '#0f0e0c',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, 'preload.js'),
      // Throttles JS timers to ≥1s when the renderer is backgrounded.
      // Does NOT throttle CSS animations or audio — we handle those in JS.
      backgroundThrottling: true,
    },
  });

  mainWindow.loadFile('thockboard.html');

  mainWindow.once('ready-to-show', () => showMainWindow());

  mainWindow.webContents.on('did-finish-load', () => {
    notifyRendererLifecycle('did-finish-load');
  });

  // Hide to tray instead of quitting
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      hideMainWindow();
    }
  });

  mainWindow.on('show',       () => notifyRendererLifecycle('show'));
  mainWindow.on('hide',       () => notifyRendererLifecycle('hide'));
  mainWindow.on('focus',      () => notifyRendererLifecycle('focus'));
  mainWindow.on('blur',       () => notifyRendererLifecycle('blur'));
  mainWindow.on('minimize',   () => notifyRendererLifecycle('minimize'));
  mainWindow.on('restore',    () => notifyRendererLifecycle('restore'));
  mainWindow.on('maximize',   () => notifyRendererLifecycle('maximize'));
  mainWindow.on('unmaximize', () => notifyRendererLifecycle('unmaximize'));
  mainWindow.on('closed',     () => { mainWindow = null; });
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABYSURBVDiNY/z//z8DIYCJgUBACqMBDAwM/1ECgxoMasCoAaMGjBowasCoAaMGjBowasCoAaMGjBowasCoAaMGjBowasCoAaMGjBoAAMAfTg0BjGmxAAAAAElFTkSuQmCC'
  );
  tray = new Tray(icon);
  tray.setToolTip('ThockBoard');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show ThockBoard',  click: () => showMainWindow() },
    { label: 'Hide ThockBoard',  click: () => hideMainWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) hideMainWindow();
    else showMainWindow();
  });
}

// ── Global key capture via uiohook-napi ──────────────────────
function startGlobalKeyCapture() {
  let uiohook;
  try {
    uiohook = require('uiohook-napi');
  } catch (e) {
    console.log('[ThockBoard] uiohook-napi not available, using window-focused mode.');
    return;
  }

  const { uIOhook } = uiohook;

  uIOhook.on('keydown', (e) => sendToRenderer('global-keydown', { keycode: e.keycode }));
  uIOhook.on('keyup',   (e) => sendToRenderer('global-keyup',   { keycode: e.keycode }));
  uIOhook.start();

  app.on('will-quit', () => {
    try { uIOhook.stop(); } catch (err) {}
  });

  console.log('[ThockBoard] Global key capture active.');
}

// ── Power / OS lifecycle hooks ───────────────────────────────
function registerPowerHooks() {
  // Read initial battery state (available after app ready)
  try {
    onBattery = !powerMonitor.isOnBatteryPower
      ? false
      : powerMonitor.isOnBatteryPower();
  } catch (_) {}

  powerMonitor.on('suspend', () => {
    sendToRenderer('system-power', { state: 'suspend', onBattery });
  });

  powerMonitor.on('resume', () => {
    sendToRenderer('system-power', { state: 'resume', onBattery });
    notifyRendererLifecycle('system-resume');
  });

  powerMonitor.on('on-battery', () => {
    onBattery = true;
    sendToRenderer('system-power', { state: 'on-battery', onBattery: true });
    notifyRendererLifecycle('on-battery');
  });

  powerMonitor.on('on-ac', () => {
    onBattery = false;
    sendToRenderer('system-power', { state: 'on-ac', onBattery: false });
    notifyRendererLifecycle('on-ac');
  });
}

// ── App lifecycle ────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();
  registerPowerHooks();
  startGlobalKeyCapture();
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', (e) => {
  // Stay resident in tray
  e.preventDefault();
});

app.on('activate', () => {
  if (!mainWindow) { createWindow(); return; }
  showMainWindow();
});
