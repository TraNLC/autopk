const { app, BrowserWindow } = require('electron');
const path = require('path');
const sessionManager = require('./session-manager');
const ipcRegister = require('./ipc-register');

let mainWindow = null;

function createWindow() {
  console.log('[TRACE] [Main] Khoi tao cua so Electron chinh (createWindow)...');
  mainWindow = new BrowserWindow({
    width: 450,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    resizable: true,
    frame: true,
    autoHideMenuBar: true,
    title: 'GST Auto TK ver 1.0 (17/07/2026 14:20)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Dang ky tat ca cac IPC handlers/listeners
  ipcRegister.registerHandlers(mainWindow);

  mainWindow.on('closed', async () => {
    console.log('[TRACE] [Main] Cuaso chinh da dong. Dang thuc hien don dep tai nguyen...');
    await sessionManager.cleanup();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  console.log('[TRACE] [Main] Electron App ready. Dang tao cua so...');
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  console.log('[TRACE] [Main] Tat ca cac cua so da dong. Dang tat app...');
  await sessionManager.cleanup();
  if (process.platform !== 'darwin') app.quit();
});


