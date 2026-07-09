// config.js -- Cau hinh tap trung cho toan bo tool
const path = require('path');

module.exports = {
  // === ADB ===
  ADB_PATH: (() => {
    const fs = require('fs');
    const { execSync } = require('child_process');
    const defaultPath = 'C:\\platform-tools\\adb.exe';
    if (fs.existsSync(defaultPath)) {
      return defaultPath;
    }
    // Check if adb.exe is placed in the tool's root directory
    const localRootPath = path.join(__dirname, 'adb.exe');
    if (fs.existsSync(localRootPath)) {
      return localRootPath;
    }
    // Check if adb.exe is placed in the tools directory
    const localToolsPath = path.join(__dirname, 'tools', 'adb.exe');
    if (fs.existsSync(localToolsPath)) {
      return localToolsPath;
    }
    // Check if adb is globally available in the system PATH
    try {
      execSync('adb --version', { stdio: 'ignore' });
      return 'adb';
    } catch (e) {}
    return defaultPath; // Fallback
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
