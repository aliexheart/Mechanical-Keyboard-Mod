// main.js — Electron main process for ThockBoard
//
// Electron gives us two things the browser can't:
//   1. globalShortcut / uioHook for system-wide key capture
//   2. A proper macOS app wrapper (menu bar, dock, etc.)
//
// Architecture:
//   main process  →  ipcMain receives key events from uiohook
//   renderer      →  ipcRenderer listens and plays the sound
//
// We use 'uiohook-napi' for global key capture — it's the most
// reliable cross-platform native hook for Electron. It requires
// Accessibility permission on macOS, same as the Swift approach.

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');

let mainWindow;
let tray;

// ── macOS: don't show in Dock by default (feels like a utility)
// Users can re-enable via the tray menu.
app.dock && app.dock.hide();

// Allow audio to play without a prior user gesture (Electron blocks autoplay by default)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 620,
    minWidth: 780,
    minHeight: 520,
    titleBarStyle: 'hiddenInset',   // native macOS traffic lights
    vibrancy: 'under-window',       // frosted glass effect on macOS
    visualEffectState: 'active',
    backgroundColor: '#0f0e0c',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  mainWindow.loadFile('thockboard.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Keep app running when window is closed (lives in tray)
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Simple keyboard emoji as tray icon (works without a .icns file)
  const icon = nativeImage.createFromDataURL(
    // 16x16 white keyboard SVG as PNG data URI
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABYSURBVDiNY/z//z8DIYCJgUBACqMBDAwM/1ECgxoMasCoAaMGjBowasCoAaMGjBowasCoAaMGjBowasCoAaMGjBowasCoAaMGjBowasCoAaMGjBoAAMAfTg0BjGmxAAAAAElFTkSuQmCC'
  );

  tray = new Tray(icon);
  tray.setToolTip('ThockBoard');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show ThockBoard',
      click: () => {
        mainWindow.show();
        app.dock && app.dock.show();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

// ── Global key capture via uiohook-napi ──────────────────────
// This fires for ALL keypresses system-wide, not just when the
// app window is focused.

function startGlobalKeyCapture() {
  let uiohook;
  try {
    uiohook = require('uiohook-napi');
  } catch (e) {
    // uiohook not installed — fall back to window-focused only
    console.log('[ThockBoard] uiohook-napi not available, using window-focused mode.');
    console.log('  Run: npm install uiohook-napi   to enable system-wide capture.');
    return;
  }

  const { uIOhook, UiohookKey } = uiohook;

  uIOhook.on('keydown', (e) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('global-keydown', { keycode: e.keycode });
    }
  });

  uIOhook.on('keyup', (e) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('global-keyup', { keycode: e.keycode });
    }
  });

  uIOhook.start();

  app.on('will-quit', () => {
    uIOhook.stop();
  });

  console.log('[ThockBoard] Global key capture active.');
}

// ── App lifecycle ────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  createTray();
  startGlobalKeyCapture();
});

app.on('window-all-closed', (e) => {
  // Don't quit — stay in tray
  e.preventDefault();
});

app.on('activate', () => {
  // macOS: re-show window when dock icon clicked
  if (mainWindow) {
    mainWindow.show();
  }
});
