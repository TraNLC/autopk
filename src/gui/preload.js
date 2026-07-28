const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  scanDevices: () => ipcRenderer.invoke('scan-devices'),
  toggleDevice: (deviceId, connect) => ipcRenderer.invoke('toggle-device', deviceId, connect),
  toggleAutoTK: (enable, side, lacs) => ipcRenderer.invoke('toggle-auto-tk', enable, side, lacs),
  getShopDetails: (mapId, sellerId) => ipcRenderer.invoke('get-shop-details', mapId, sellerId),
  showShopDetail: (shopData) => ipcRenderer.send('show-shop-detail', shopData),
  showAllShopsDetail: (data) => ipcRenderer.send('show-all-shops-detail', data),
  testCastSkill: (deviceId) => ipcRenderer.invoke('test-cast-skill', deviceId),
  testBuff: (deviceId) => ipcRenderer.invoke('test-buff', deviceId),
  testNpcFindByName: (deviceId, npcName) => ipcRenderer.invoke('test-npc-find-by-name', deviceId, npcName),
  testNpcGetAll: (deviceId) => ipcRenderer.invoke('test-npc-get-all', deviceId),
  testNpcNearNames: (deviceId) => ipcRenderer.invoke('test-npc-near-names', deviceId),
  npcInteract: (deviceId, npcId) => ipcRenderer.invoke('npc-interact', deviceId, npcId),
  npcSelectOption: (deviceId, index) => ipcRenderer.invoke('npc-select-option', deviceId, index),
  collectPoints: (deviceId) => ipcRenderer.invoke('collect-points', deviceId),
  testNpcNetworkScan: (deviceId) => ipcRenderer.invoke('test-npc-network-scan', deviceId),
  saveNpcCoordinates: (data) => ipcRenderer.invoke('save-npc-coordinates', data),
  testMove: (deviceId, x, y) => ipcRenderer.invoke('test-move', deviceId, x, y),
  getPlayerPosition: (deviceId) => ipcRenderer.invoke('get-player-position', deviceId),
  saveNpcCoordsManual: (data) => ipcRenderer.invoke('save-npc-coords-manual', data),
  
  // Optimization
  setGameSpeed: (deviceId, speed) => ipcRenderer.invoke('set-game-speed', deviceId, speed),
  optimizeAdbResolution: (isLow) => ipcRenderer.invoke('optimize-adb-resolution', isLow),
  
  // Event listeners
  onTabLog: (callback) => {
    ipcRenderer.removeAllListeners('tab-log');
    ipcRenderer.on('tab-log', (event, data) => callback(data));
  },
  onPlayerInfoUpdate: (callback) => {
    ipcRenderer.removeAllListeners('player-info-update');
    ipcRenderer.on('player-info-update', (event, data) => callback(data));
  },
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateStatus: (callback) => {
    ipcRenderer.removeAllListeners('update-status');
    ipcRenderer.on('update-status', (event, msg) => callback(msg));
  }
});
