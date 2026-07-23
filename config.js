// config.js -- Cau hinh tap trung cho toan bo tool
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function findAdbPath() {
  const memuAdb = 'C:\\Microvirt\\MEmu\\adb.exe';
  if (fs.existsSync(memuAdb)) return memuAdb;

  const localAdb = path.join(process.cwd(), 'tools', 'adb.exe');

  try {
    const electronMod = 'electron';
    const electron = require(electronMod);
    const app = electron.app || (electron.remote && electron.remote.app);
    if (app && app.isPackaged && process.resourcesPath) {
      const candidates = [
        path.join(process.resourcesPath, 'tools', 'adb.exe'),
        path.join(process.resourcesPath, 'adb.exe')
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (e) {}
  
  // (Rest of the findAdbPath contents...)
  // Skip program search details to save space in code replacement
  // We can just keep the original logic down to return
  try {
    const stdout = execSync('where adb', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\r\n')[0];
    if (stdout && fs.existsSync(stdout)) {
      return stdout;
    }
  } catch (e) {}

  try {
    const psCmd = 'powershell -Command "Get-CimInstance Win32_Process -Filter \\"name like \'%player%\' or name like \'%headless%\' or name like \'%nox%\' or name like \'%memu%\' or name like \'%leidian%\'\\" | Select-Object -ExpandProperty ExecutablePath"';
    const stdout = execSync(psCmd, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString();
    const lines = stdout.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (line && fs.existsSync(line)) {
        let dir = path.dirname(line);
        for (let depth = 0; depth < 4; depth++) {
          const files = ['adb.exe', 'nox_adb.exe', 'HD-Adb.exe'];
          for (const f of files) {
            const fullPath = path.join(dir, f);
            if (fs.existsSync(fullPath)) return fullPath;
          }
          const subdirs = ['shell', 'bin', 'platform-tools', 'vbox', 'Hypervisor'];
          for (const sub of subdirs) {
            for (const f of files) {
              const fullPath = path.join(dir, sub, f);
              if (fs.existsSync(fullPath)) return fullPath;
            }
          }
          const parent = path.dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }
      }
    }
  } catch (e) {}

  const regKeys = [
    { key: 'HKLM\\Software\\Microvirt\\MEmu', val: 'InstallDir', file: 'adb.exe' },
    { key: 'HKLM\\Software\\WOW6432Node\\Microvirt\\MEmu', val: 'InstallDir', file: 'adb.exe' },
    { key: 'HKCU\\Software\\ChangZhi\\LDPlayer9', val: 'InstallDir', file: 'adb.exe' },
    { key: 'HKLM\\Software\\ChangZhi\\LDPlayer9', val: 'InstallDir', file: 'adb.exe' },
    { key: 'HKLM\\Software\\WOW6432Node\\ChangZhi\\LDPlayer9', val: 'InstallDir', file: 'adb.exe' },
    { key: 'HKCU\\Software\\ChangZhi\\LDPlayer', val: 'InstallDir', file: 'adb.exe' },
    { key: 'HKLM\\Software\\ChangZhi\\LDPlayer', val: 'InstallDir', file: 'adb.exe' },
    { key: 'HKLM\\Software\\WOW6432Node\\ChangZhi\\LDPlayer', val: 'InstallDir', file: 'adb.exe' },
    { key: 'HKCU\\Software\\Nox', val: 'InstallDir', file: 'bin\\nox_adb.exe' },
    { key: 'HKLM\\Software\\Nox', val: 'InstallDir', file: 'bin\\nox_adb.exe' },
    { key: 'HKLM\\Software\\WOW6432Node\\Nox', val: 'InstallDir', file: 'bin\\nox_adb.exe' },
    { key: 'HKLM\\Software\\Netease\\MuMuPlayer-12.0', val: 'InstallDir', file: 'shell\\adb.exe' },
    { key: 'HKLM\\Software\\WOW6432Node\\Netease\\MuMuPlayer-12.0', val: 'InstallDir', file: 'shell\\adb.exe' },
    { key: 'HKLM\\Software\\Netease\\MuMuPlayer', val: 'InstallDir', file: 'shell\\adb.exe' },
    { key: 'HKLM\\Software\\WOW6432Node\\Netease\\MuMuPlayer', val: 'InstallDir', file: 'shell\\adb.exe' },
    { key: 'HKLM\\Software\\BlueStacks_nxt', val: 'InstallDir', file: 'HD-Adb.exe' },
    { key: 'HKLM\\Software\\WOW6432Node\\BlueStacks_nxt', val: 'InstallDir', file: 'HD-Adb.exe' }
  ];

  for (const r of regKeys) {
    try {
      const out = execSync(`reg query "${r.key}" /v "${r.val}"`, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString();
      const match = out.match(new RegExp(`${r.val}\\s+REG_SZ\\s+(.+)`, 'i'));
      if (match) {
        let dir = match[1].trim();
        const fullPath = path.join(dir, r.file);
        if (fs.existsSync(fullPath)) return fullPath;
      }
    } catch (e) {}
  }

  const envVars = ['ANDROID_HOME', 'ANDROID_SDK_ROOT', 'LOCALAPPDATA', 'USERPROFILE'];
  for (const envVar of envVars) {
    const base = process.env[envVar];
    if (base) {
      const paths = [
        path.join(base, 'platform-tools', 'adb.exe'),
        path.join(base, 'Android', 'Sdk', 'platform-tools', 'adb.exe')
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return p;
      }
    }
  }

  const drives = ['C:', 'D:', 'E:'];
  const dirs = [
    'Microvirt\\MEmu\\adb.exe',
    'LDPlayer\\LDPlayer9\\adb.exe',
    'LDPlayer\\LDPlayer4\\adb.exe',
    'ChangZhi\\LDPlayer9\\adb.exe',
    'ChangZhi\\LDPlayer\\adb.exe',
    'platform-tools\\adb.exe',
    'Android\\Sdk\\platform-tools\\adb.exe',
    'Program Files\\Microvirt\\MEmu\\adb.exe',
    'Program Files (x86)\\Microvirt\\MEmu\\adb.exe',
    'Program Files\\MuMuPlayer-12.0\\shell\\adb.exe',
    'Program Files (x86)\\MuMu\\emulator\\nemu\\vbox\\keymap\\adb.exe',
    'Program Files\\BlueStacks_nxt\\HD-Adb.exe',
    'Program Files (x86)\\Nox\\bin\\nox_adb.exe',
    'Program Files\\Nox\\bin\\nox_adb.exe'
  ];

  for (const drive of drives) {
    for (const dir of dirs) {
      const fullPath = path.join(drive, '\\', dir);
      if (fs.existsSync(fullPath)) return fullPath;
    }
  }

  return 'adb.exe';
}

function findToolsDir() {
  try {
    const electronMod = 'electron';
    const electron = require(electronMod);
    const app = electron.app || (electron.remote && electron.remote.app);
    if (app && app.isPackaged && process.resourcesPath) {
      const p = path.join(process.resourcesPath, 'tools');
      if (fs.existsSync(p)) return p;
    }
  } catch (e) {}

  return fs.existsSync(path.join(process.cwd(), 'tools'))
    ? path.join(process.cwd(), 'tools')
    : path.join(__dirname, 'tools');
}

const adbPath = findAdbPath();
const toolsDir = findToolsDir();

module.exports = {
  // === ADB ===
  ADB_PATH: adbPath,
  DEVICE_ID: 'emulator-5556',
  
  // === Game ===
  GAME_PACKAGE: 'vn.perfingame.jx1mobile',
  GAME_ACTIVITY: 'com.vng.vltk1m.MainActivity', // Unity activity
  
  // === Emulator Ports ===
  DEFAULT_PORTS: [
    5555, 5557, 5559, 5561, 5563, 5565, 5567, 5569, // LDPlayer, BlueStacks, standard ADB
    62001, 62025, 62026, 62027, // Nox
    21503, 21513, 21523, 21533, // MEmu
    7555, 16416, 16432, 16448, 26624, 26656, 26688, 26720, 26752, 26784, 26816, 26880 // MuMu
  ],

  // === Frida ===
  FRIDA_SERVER_PATH: '/data/local/tmp/frida-server',
  FRIDA_SCRIPTS_DIR: fs.existsSync(path.join(process.cwd(), 'frida-scripts')) ? path.join(process.cwd(), 'frida-scripts') : path.join(__dirname, 'frida-scripts'),
  
  // === NPC Tong Kim (fallback neu chua hoc tu click tay) ===
  TK_HEAL_NPC: 5554,
  TK_HEAL_OPT: 1,
  TK_WAR_NPC: 5574,
  TK_WAR_OPT: 1,
  TK_REJOIN_CD: 5.0,

  // === Ngu Hanh ===
  NGU_HANH: ['Kim', 'Moc', 'Thuy', 'Hoa', 'Tho'],

  // === Paths ===
  DATA_DIR: fs.existsSync(path.join(process.cwd(), 'data')) ? path.join(process.cwd(), 'data') : path.join(__dirname, 'data'),
  OUTPUT_DIR: fs.existsSync(path.join(process.cwd(), 'data', 'output')) ? path.join(process.cwd(), 'data', 'output') : path.join(__dirname, 'data', 'output'),
  TOOLS_DIR: toolsDir,
};
