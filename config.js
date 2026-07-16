// config.js -- Cau hinh tap trung cho toan bo tool
const path = require('path');

module.exports = {
  // === ADB ===
  ADB_PATH: (() => {
    const fs = require('fs');
    const { execSync } = require('child_process');
    
    // Check if we are running inside Electron and if it is packaged
    let isPackaged = false;
    let resourcesPath = '';
    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app) {
        isPackaged = app.isPackaged;
      }
      if (process.resourcesPath) {
        resourcesPath = process.resourcesPath;
      }
    } catch (e) {}

    const candidates = [];
    if (isPackaged && resourcesPath) {
      candidates.push(path.join(resourcesPath, 'tools', 'adb.exe'));
      candidates.push(path.join(resourcesPath, 'adb.exe'));
    }
    candidates.push('C:\\platform-tools\\adb.exe');
    candidates.push(path.join(__dirname, 'adb.exe'));
    candidates.push(path.join(__dirname, 'tools', 'adb.exe'));

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    // Check if adb is globally available in the system PATH
    try {
      execSync('adb --version', { stdio: 'ignore' });
      return 'adb';
    } catch (e) {}
    return 'C:\\platform-tools\\adb.exe'; // Fallback
  })(),
  DEVICE_ID: 'emulator-5554',
  
  // === Game ===
  GAME_PACKAGE: 'vn.perfingame.jx1mobile',
  GAME_ACTIVITY: 'com.vng.vltk1m.MainActivity', // Unity activity
  
  // === Emulator Ports ===
  // MuMu: 5555, 26624, 26656, 26688, 26720, 26752, 26784, 26816, 26880
  // MEmu: 21503, 21513, 21523, 21533, 21543, 21553
  DEFAULT_PORTS: [
    16384, 16388, 16392, 16396,
    16416, 16432, 16448, 16464,
    7555, 7556, 7557, 7558,
    21503, 21513
  ],

  // === Frida ===
  FRIDA_SERVER_PATH: '/data/local/tmp/frida-server',
  FRIDA_SCRIPTS_DIR: path.join(__dirname, 'frida-scripts'),

  // === NPC Tong Kim (fallback neu chua hoc tu click tay) ===
  TK_HEAL_NPC: 5554,
  TK_HEAL_OPT: 1,
  TK_WAR_NPC: 5574,
  TK_WAR_OPT: 1,
  TK_REJOIN_CD: 5.0,

  // === Ngu Hanh ===
  NGU_HANH: ['Kim', 'Moc', 'Thuy', 'Hoa', 'Tho'],

  // === Paths ===
  DATA_DIR: path.join(__dirname, 'data'),
  OUTPUT_DIR: path.join(__dirname, 'data', 'output'),
  TOOLS_DIR: path.join(__dirname, 'tools'),
};
