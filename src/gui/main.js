const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const sessionManager = require('./session-manager');
const ipcRegister = require('./ipc-register');

let mainWindow = null;

function createWindow() {
  console.log('[TRACE] [Main] Khoi tao cua so Electron chinh (createWindow)...');
  mainWindow = new BrowserWindow({
    width: 800,
    height: 550,
    minWidth: 750,
    minHeight: 450,
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

  globalThis._mainWindow = mainWindow;

  mainWindow.setMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Dang ky tat ca cac IPC handlers/listeners
  ipcRegister.registerHandlers(mainWindow);

  mainWindow.on('closed', async () => {
    console.log('[TRACE] [Main] Cuaso chinh da dong. Dang thuc hien don dep tai nguyen...');
    await sessionManager.cleanup();
    mainWindow = null;
    globalThis._mainWindow = null;
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
  
  autoUpdater.on('update-available', () => {
    if (globalThis._mainWindow) {
      globalThis._mainWindow.webContents.send('update-status', 'Đã tìm thấy bản cập nhật. Đang tải...');
    }
  });

  autoUpdater.on('update-not-available', () => {
    if (globalThis._mainWindow) {
      globalThis._mainWindow.webContents.send('update-status', 'Bạn đang dùng bản mới nhất!');
    }
  });

  autoUpdater.on('error', (err) => {
    if (globalThis._mainWindow) {
      globalThis._mainWindow.webContents.send('update-status', 'Lỗi cập nhật: ' + err.message);
    }
  });

  ipcMain.handle('check-for-updates', async () => {
    try {
      if (globalThis._mainWindow) {
        globalThis._mainWindow.webContents.send('update-status', 'Đang kiểm tra cập nhật...');
      }
      return await autoUpdater.checkForUpdates();
    } catch (e) {
      console.log("[AutoUpdater] Loi khi check for updates", e.message);
      return null;
    }
  });
});

app.on('window-all-closed', async () => {
  console.log('[TRACE] [Main] Tat ca cac cua so da dong. Dang tat app...');
  await sessionManager.cleanup();
  if (process.platform !== 'darwin') app.quit();
});


