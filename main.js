const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let tray;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 860,
    minHeight: 560,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#FFF4E8',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile('thockboard.html');
  mainWindow.show();
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('ThockBoard');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow.show() },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => mainWindow.show());
}

function startGlobalKeyCapture() {
  try {
    const { uIOhook } = require('uiohook-napi');
    uIOhook.on('keydown', (e) => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('global-keydown', { keycode: e.keycode });
    });
    uIOhook.on('keyup', (e) => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('global-keyup', { keycode: e.keycode });
    });
    uIOhook.start();
  } catch (e) {
    // window-focused mode only
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  startGlobalKeyCapture();
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('activate', () => mainWindow && mainWindow.show());
ipcMain.handle('get-capture-status', () => {
  try { require('uiohook-napi'); return 'system-wide'; }
  catch { return 'focused-only'; }
});
