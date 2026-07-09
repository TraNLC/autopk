const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  scanDevices: () => ipcRenderer.invoke('scan-devices'),
  toggleDevice: (deviceId, connect) => ipcRenderer.invoke('toggle-device', deviceId, connect),
  toggleAutoTK: (enable, side, lacs) => ipcRenderer.invoke('toggle-auto-tk', enable, side, lacs),
  scanDatau: (deviceId, keyword, filters) => ipcRenderer.invoke('scan-datau', deviceId, keyword, filters),
  buyDatau: (deviceId, sellerId, itemIdx, price) => ipcRenderer.invoke('buy-datau', deviceId, sellerId, itemIdx, price),
  getShopDetails: (mapId, sellerId) => ipcRenderer.invoke('get-shop-details', mapId, sellerId),
  showShopDetail: (shopData) => ipcRenderer.send('show-shop-detail', shopData),
  showAllShopsDetail: (data) => ipcRenderer.send('show-all-shops-detail', data),
  show5HanhDetail: (data) => ipcRenderer.send('show-5hanh-detail', data),
  testCastSkill: (deviceId) => ipcRenderer.invoke('test-cast-skill', deviceId),
  testBuff: (deviceId) => ipcRenderer.invoke('test-buff', deviceId),
  testNpcFindByName: (deviceId, npcName) => ipcRenderer.invoke('test-npc-find-by-name', deviceId, npcName),
  testNpcGetAll: (deviceId) => ipcRenderer.invoke('test-npc-get-all', deviceId),
  testNpcNearNames: (deviceId) => ipcRenderer.invoke('test-npc-near-names', deviceId),
  npcInteract: (deviceId, npcId) => ipcRenderer.invoke('npc-interact', deviceId, npcId),
  npcSelectOption: (deviceId, index) => ipcRenderer.invoke('npc-select-option', deviceId, index),
  collectPoints: (deviceId) => ipcRenderer.invoke('collect-points', deviceId),
  performAutoLogin: (deviceId, username, password) => ipcRenderer.invoke('perform-auto-login', deviceId, username, password),
  performFullAutoLaunch: (mumuPath, username, password, port, index) => ipcRenderer.invoke('full-auto-launch', mumuPath, username, password, port, index),
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
