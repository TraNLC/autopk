const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  scanDevices: () => ipcRenderer.invoke('scan-devices'),
  toggleDevice: (deviceId, connect) => ipcRenderer.invoke('toggle-device', deviceId, connect),
  toggleAutoTK: (enable, side, lacs) => ipcRenderer.invoke('toggle-auto-tk', enable, side, lacs),
  testChatNpc: (npcId) => ipcRenderer.invoke('test-chat-npc', npcId),
  testNpc: (deviceId, index) => ipcRenderer.invoke('test-npc', deviceId, index),
  scanDatau: (deviceId, keyword, filters) => ipcRenderer.invoke('scan-datau', deviceId, keyword, filters),
  onScanDatauProgress: (callback) => ipcRenderer.on('datau-progress', (event, msg) => callback(msg)),
  
  // Event listeners
  onTabLog: (callback) => {
    ipcRenderer.removeAllListeners('tab-log');
    ipcRenderer.on('tab-log', (event, data) => callback(data));
  },
  onPlayerInfoUpdate: (callback) => {
    ipcRenderer.removeAllListeners('player-info-update');
    ipcRenderer.on('player-info-update', (event, data) => callback(data));
  }
});
