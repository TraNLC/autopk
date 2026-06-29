// config.js -- Cau hinh tap trung cho toan bo tool
const path = require('path');

module.exports = {
  // === ADB ===
  ADB_PATH: 'C:\\platform-tools\\adb.exe',
  DEVICE_ID: 'emulator-5554',
  
  // === Game ===
  GAME_PACKAGE: 'vn.perfingame.jx1mobile',
  GAME_ACTIVITY: 'com.vng.vltk1m.MainActivity', // Unity activity
  
  // === Emulator Ports ===
  // MuMu: 5555, 26624, 26656, 26688, 26720, 26752, 26784, 26816, 26880
  // MEmu: 21503, 21513, 21523, 21533, 21543, 21553
  DEFAULT_PORTS: [
    16416, 16432, 16448, 5555, 5556, 5557, 62001, 21503, 21513
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

  // === Speed items (Lac Tong Kim): particular ID, gap seconds ===
  LAC_TYPES: [
    { label: 'Phi Toc Hoan', particular: 45, gap: 295 },
    { label: 'Lenh Bai',     particular: 51, gap: 175 },
    { label: 'Chien Co',     particular: 50, gap: 175 },
  ],

  // === Auto-PK thresholds ===
  HP_THRESHOLD_PCT: 65,
  MP_THRESHOLD_PCT: 30,
  HEAL_SLOT: 0,       // default HP potion bag slot
  MANA_SLOT: 1,       // default MP potion bag slot
  BUFF_GAP: 60,       // seconds between buff casts

  // === Ngu Hanh ===
  NGU_HANH: ['Kim', 'Moc', 'Thuy', 'Hoa', 'Tho'],
  CAMP_LABEL: { 1: 'Tong', 2: 'Kim' },
  SERIES_LABEL: { 0: 'Kim', 1: 'Moc', 2: 'Thuy', 3: 'Hoa', 4: 'Tho' },

  // === Paths ===
  DATA_DIR: path.join(__dirname, 'data'),
  OUTPUT_DIR: path.join(__dirname, 'data', 'output'),
  TOOLS_DIR: path.join(__dirname, 'tools'),
  NPC_DB_FILE: path.join(__dirname, 'data', 'output', 'tk_npc_learn.json'),
};
