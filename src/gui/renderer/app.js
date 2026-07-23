// UI Elements
const btnRefresh = document.getElementById('btn-refresh');
const btnRestart = document.getElementById('btn-restart');
const deviceTableBody = document.getElementById('device-table-body');
const globalLogContainer = document.getElementById('global-log-container');

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Remove active class
    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));
    
    // Add active class
    btn.classList.add('active');
    const targetId = btn.getAttribute('data-tab');
    document.getElementById(targetId).classList.add('active');
  });
});

// TK Settings Elements
const btnToggleAutoTk = document.getElementById('btn-toggle-auto-tk');
const lblSelectedAcc = document.getElementById('lbl-selected-acc');
const accSettingsPanel = document.getElementById('acc-settings-panel');
const selSide = document.getElementById('sel-side');
const chkLac1 = document.getElementById('chk-lac1');
const chkLac2 = document.getElementById('chk-lac2');
const chkLac3 = document.getElementById('chk-lac3');
const btnSaveAcc = document.getElementById('btn-save-acc');

let isAutoTKEnabled = false;

if (btnToggleAutoTk) {
  btnToggleAutoTk.addEventListener('click', () => {
    isAutoTKEnabled = !isAutoTKEnabled;
    updateAutoTkButtonState();
    updateGlobalTK();
  });
}

function updateAutoTkButtonState() {
  if (!btnToggleAutoTk) return;
  if (isAutoTKEnabled) {
    btnToggleAutoTk.innerText = 'TAM DUNG AUTO TONG KIM';
    btnToggleAutoTk.style.backgroundColor = '#c0392b';
  } else {
    btnToggleAutoTk.innerText = 'BAT DAU AUTO TONG KIM';
    btnToggleAutoTk.style.backgroundColor = '#27ae60';
  }
}

// State
let devicesMap = new Map(); // id -> { name, status, info, tkConfig }
let currentSelectedDeviceId = null;

const logsMap = new Map();

function addLog(msg, type = 'info') {
  // Trích xuất deviceId nếu có (ví dụ "[emulator-5554] ...")
  let deviceId = 'SYSTEM';
  const match = msg.match(/^\[([^\]]+)\]/);
  if (match) {
    const rawId = match[1];
    if (rawId !== 'SYSTEM' && rawId !== 'System') {
      let foundId = null;
      for (const [id, dev] of devicesMap.entries()) {
        const name = (dev.info && dev.info.name) ? dev.info.name : id;
        if (id === rawId || name === rawId) {
          foundId = id;
          break;
        }
      }
      deviceId = foundId || rawId;
    }
  }

  // Lưu vào buffer của từng thiết bị
  if (!logsMap.has(deviceId)) {
    logsMap.set(deviceId, []);
  }
  const deviceLogs = logsMap.get(deviceId);
  deviceLogs.push({ msg, type });
  
  if (deviceLogs.length > 500) deviceLogs.shift();

  // Hiển thị nếu thiết bị đang được chọn (hoặc mặc định SYSTEM nếu chưa chọn)
  const activeId = currentSelectedDeviceId || 'SYSTEM';
  if (deviceId === activeId) {
    appendLogToUI(msg, type);
  }
}

function appendLogToUI(msg, type) {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.innerText = msg;
  globalLogContainer.appendChild(entry);
  globalLogContainer.scrollTop = globalLogContainer.scrollHeight;
}

function renderLogsForSelectedDevice(id) {
  globalLogContainer.innerHTML = '';
  const activeId = id || 'SYSTEM';
  
  const lblLogTitle = document.getElementById('lbl-log-title');
  if (lblLogTitle) {
    if (id && devicesMap.has(id)) {
      const dev = devicesMap.get(id);
      const name = (dev.info && dev.info.name) ? dev.info.name : id;
      lblLogTitle.innerText = `Nhat ky hoat dong: ${name}`;
    } else {
      lblLogTitle.innerText = 'Nhat ky hoat dong: He thong';
    }
  }
  
  const logs = logsMap.get(activeId) || [];
  logs.forEach(log => {
    appendLogToUI(log.msg, log.type);
  });
}

// Setup IPC Listeners
window.api.onTabLog((data) => {
  addLog(data.msg, data.type);
});

window.api.onPlayerInfoUpdate(({ deviceId, info }) => {
  if (devicesMap.has(deviceId)) {
    const dev = devicesMap.get(deviceId);
    dev.info = info;
    renderTable();
  }
});

// Device Scanning
async function scanDevices() {
  deviceTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Đang quét...</td></tr>';
  const res = await window.api.scanDevices();
  if (!res.ok) {
    addLog(`[System] Quét thiết bị thất bại: ${res.error}`, 'error');
    deviceTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Lỗi quét!</td></tr>';
    return;
  }
  
  if (res.devices.length === 0) {
    deviceTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #888;">Không tìm thấy giả lập</td></tr>';
    return;
  }

  const newMap = new Map();
  for (const d of res.devices) {
    if (devicesMap.has(d.id)) {
      newMap.set(d.id, devicesMap.get(d.id));
    } else {
      newMap.set(d.id, { connected: false, info: null, tkConfig: { side: 'auto', lacs: ['45', '51', '50'], autoBaoDanh: true } });
    }
  }
  devicesMap = newMap;
  
  if (!devicesMap.has(currentSelectedDeviceId)) {
    selectDevice(null);
  }
  renderTable();
}

function renderTable() {
  deviceTableBody.innerHTML = '';
  for (const [id, dev] of devicesMap.entries()) {
    const tr = document.createElement('tr');
    if (id === currentSelectedDeviceId) tr.classList.add('selected');
    
    tr.addEventListener('click', (e) => {
      // Don't trigger if clicking checkbox
      if (e.target.tagName.toLowerCase() === 'input') return;
      if (currentSelectedDeviceId === id) {
        selectDevice(null); // Click lại để bỏ chọn và hiện log hệ thống
      } else {
        selectDevice(id);
      }
    });
    
    // Toggle (#)
    const tdToggle = document.createElement('td');
    const chkToggle = document.createElement('input');
    chkToggle.type = 'checkbox';
    chkToggle.checked = dev.connected;
    chkToggle.addEventListener('change', async (e) => {
      const connect = e.target.checked;
      dev.connected = connect;
      if (!connect) dev.info = null;
      renderTable();
      const res = await window.api.toggleDevice(id, connect);
      if (connect && res && !res.ok) {
        dev.connected = false;
        dev.info = { error: res.error };
        renderTable();
      }
    });
    tdToggle.appendChild(chkToggle);
    
    // Name
    const tdName = document.createElement('td');
    let nameText = id;
    if (dev.info && dev.info.name) {
      nameText = dev.info.name;
    }
    const nameSpan = document.createElement('span');
    nameSpan.className = dev.connected ? 'text-blue' : '';
    if (dev.tkConfig && dev.tkConfig.fightTop1) {
      nameSpan.innerHTML = nameText + ' <span class="badge-top1" style="background:#e74c3c; color:white; font-size:10px; padding:2px 5px; border-radius:4px; margin-left:5px; font-weight:bold; box-shadow:0 2px 5px rgba(231,76,60,0.5);">Top 1 🔥</span>';
    } else {
      nameSpan.innerText = nameText;
    }
    tdName.appendChild(nameSpan);
    
    // Level
    const tdLevel = document.createElement('td');
    tdLevel.innerText = (dev.info && dev.info.level) ? dev.info.level : '';
    
    // Sect
    const tdSect = document.createElement('td');
    tdSect.innerText = (dev.info && dev.info.sectName) ? dev.info.sectName : '';
    
    // Score
    const tdScore = document.createElement('td');
    tdScore.innerText = (dev.info && dev.info.tkScore !== undefined) ? dev.info.tkScore : '';



// Auto TK Logic
function updateGlobalTK() {
  const tkConfigs = {};
  for (const [id, dev] of devicesMap.entries()) {
    if (dev.tkConfig) tkConfigs[id] = dev.tkConfig;
  }
  window.api.toggleAutoTK(isAutoTKEnabled, tkConfigs);
}

// Top Buttons
btnRefresh.addEventListener('click', scanDevices);
btnRestart.addEventListener('click', () => {
  addLog('[System] Khoi dong lai toan bo ket noi...', 'warn');
  for (const [id, dev] of devicesMap.entries()) {
    if (dev.connected) {
      dev.connected = false;
      window.api.toggleDevice(id, false);
    }
  }
  isAutoTKEnabled = false;
  updateAutoTkButtonState();
  updateGlobalTK();
  setTimeout(scanDevices, 1000);
});

// Auto TK Logic
// Init
scanDevices();