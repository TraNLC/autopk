const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const sessionManager = require('./session-manager');
const ipcRegister = require('./ipc-register');

let mainWindow = null;

function createWindow() {
  console.log('[TRACE] [Main] Khoi tao cua so Electron chinh (createWindow)...');
  mainWindow = new BrowserWindow({
    width: 900,
    height: 800,
    minWidth: 850,
    minHeight: 600,
    resizable: true,
    frame: true,
    autoHideMenuBar: true,
    title: `GST Auto TK v${app.getVersion()}`,
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
  
  // Kích hoạt tính năng Auto-Update
  autoUpdater.checkForUpdatesAndNotify();
  
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Ban cap nhat da duoc tai xuong.');
    dialog.showMessageBox({
      type: 'info',
      title: 'Cập nhật phiên bản mới',
      message: 'Đã tải xong bản cập nhật mới nhất. Tool sẽ tự động khởi động lại để cài đặt ngay bây giờ!',
      buttons: ['Cài đặt ngay']
    }).then(() => {
      autoUpdater.quitAndInstall();
    });
  });
});

app.on('window-all-closed', async () => {
  console.log('[TRACE] [Main] Tat ca cac cua so da dong. Dang tat app...');
  await sessionManager.cleanup();
  if (process.platform !== 'darwin') app.quit();
});


