// main.js — optimized Electron main process for ThockBoard
//
// Goals:
// - preserve system-wide key capture
// - keep tray utility behavior
// - reduce background drain by notifying renderer about lifecycle changes
// - enable browser/background throttling where appropriate

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

// ── macOS: utility-style app ────────────────────────────────
if (app.dock) app.dock.hide();

// Allow audio to play without prior user gesture
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Safely send lifecycle / key events to renderer
function sendToRenderer(channel, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (!wc || wc.isDestroyed()) return;
  wc.send(channel, payload);
}

// Compute a simple visibility/activity state for renderer
function getWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return {
      visible: false,
      focused: false,
      minimized: true,
      lifecycle: 'hidden',
    };
  }

  const visible = mainWindow.isVisible();
  const focused = mainWindow.isFocused();
  const minimized = mainWindow.isMinimized();

  let lifecycle = 'active';
  if (!visible) lifecycle = 'hidden';
  else if (minimized) lifecycle = 'minimized';
  else if (!focused) lifecycle = 'background';

  return { visible, focused, minimized, lifecycle };
}

function notifyRendererLifecycle(reason = 'unknown') {
  sendToRenderer('app-lifecycle', {
    ...getWindowState(),
    reason,
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();

  if (app.dock) app.dock.show();

  notifyRendererLifecycle('show-window');
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.hide();

  // Keep utility feel when hidden to tray
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
    visualEffectState: 'active',
    backgroundColor: '#0f0e0c',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, 'preload.js'),

      // Important for battery savings when app is backgrounded/hidden.
      // This does not replace explicit pausing in renderer; it complements it.
      backgroundThrottling: true,
    },
  });

  mainWindow.loadFile('thockboard.html');

  mainWindow.once('ready-to-show', () => {
    showMainWindow();
  });

  // Renderer can ask for current state on startup/resume if needed
  mainWindow.webContents.on('did-finish-load', () => {
    notifyRendererLifecycle('did-finish-load');
  });

  // Keep app running in tray instead of quitting on close
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      hideMainWindow();
    }
  });

  mainWindow.on('show', () => {
    notifyRendererLifecycle('show');
  });

  mainWindow.on('hide', () => {
    notifyRendererLifecycle('hide');
  });

  mainWindow.on('focus', () => {
    notifyRendererLifecycle('focus');
  });

  mainWindow.on('blur', () => {
    notifyRendererLifecycle('blur');
  });

  mainWindow.on('minimize', () => {
    notifyRendererLifecycle('minimize');
  });

  mainWindow.on('restore', () => {
    notifyRendererLifecycle('restore');
  });

  // macOS sometimes changes occlusion/background behavior without hide/minimize
  mainWindow.on('maximize', () => {
    notifyRendererLifecycle('maximize');
  });

  mainWindow.on('unmaximize', () => {
    notifyRendererLifecycle('unmaximize');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABYSURBVDiNY/z//z8DIYCJgUBACqMBDAwM/1ECgxoMasCoAaMGjBowasCoAaMGjBowasCoAaMGjBowasCoAaMGjBowasCoAaMGjBoAAMAfTg0BjGmxAAAAAElFTkSuQmCC'
  );

  tray = new Tray(icon);
  tray.setToolTip('ThockBoard');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show ThockBoard',
      click: () => {
        showMainWindow();
      },
    },
    {
      label: 'Hide ThockBoard',
      click: () => {
        hideMainWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      hideMainWindow();
    } else {
      showMainWindow();
    }
  });
}

// ── Global key capture via uiohook-napi ──────────────────────

function startGlobalKeyCapture() {
  let uiohook;
  try {
    uiohook = require('uiohook-napi');
  } catch (e) {
    console.log('[ThockBoard] uiohook-napi not available, using window-focused mode.');
    console.log('  Run: npm install uiohook-napi to enable system-wide capture.');
    return;
  }

  const { uIOhook } = uiohook;

  uIOhook.on('keydown', (e) => {
    sendToRenderer('global-keydown', { keycode: e.keycode });
  });

  uIOhook.on('keyup', (e) => {
    sendToRenderer('global-keyup', { keycode: e.keycode });
  });

  uIOhook.start();

  app.on('will-quit', () => {
    try {
      uIOhook.stop();
    } catch (err) {
      console.error('[ThockBoard] Failed to stop uIOhook cleanly:', err);
    }
  });

  console.log('[ThockBoard] Global key capture active.');
}

// ── Power / OS lifecycle hooks ───────────────────────────────

function registerPowerHooks() {
  powerMonitor.on('suspend', () => {
    sendToRenderer('system-power', { state: 'suspend' });
  });

  powerMonitor.on('resume', () => {
    sendToRenderer('system-power', { state: 'resume' });
    notifyRendererLifecycle('system-resume');
  });

  powerMonitor.on('on-battery', () => {
    sendToRenderer('system-power', { state: 'on-battery' });
  });

  powerMonitor.on('on-ac', () => {
    sendToRenderer('system-power', { state: 'on-ac' });
  });
}

// ── App lifecycle ────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerPowerHooks();
  startGlobalKeyCapture();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', (e) => {
  // Stay resident in tray/menu bar
  e.preventDefault();
});

app.on('activate', () => {
  if (!mainWindow) {
    createWindow();
    return;
  }
  showMainWindow();
});