const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  scanDevices: () => ipcRenderer.invoke('scan-devices'),
  connectDevice: (deviceId) => ipcRenderer.invoke('connect-device', deviceId),
  disconnectDevice: () => ipcRenderer.invoke('disconnect-device'),
  toggleAutoPK: (run) => ipcRenderer.invoke('toggle-autopk', run),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  scanNearbyShops: () => ipcRenderer.invoke('scan-nearby-shops'),
  scanShopItems: (stallIndex) => ipcRenderer.invoke('scan-shop-items', stallIndex),
  exportAllShopsJson: () => ipcRenderer.invoke('export-all-shops-json'),
  radarScanShops: () => ipcRenderer.invoke('radar-scan-shops'),
  remoteNpcDialogue: (npcId) => ipcRenderer.invoke('remote-npc-dialogue', npcId),
  
  // Event listeners
  onTabLog: (callback) => {
    ipcRenderer.removeAllListeners('tab-log');
    ipcRenderer.on('tab-log', (event, data) => callback(data));
  },
  onPlayerInfoUpdate: (callback) => {
    ipcRenderer.removeAllListeners('player-info-update');
    ipcRenderer.on('player-info-update', (event, info) => callback(info));
  }
});
