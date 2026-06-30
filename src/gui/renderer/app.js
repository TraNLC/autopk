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
const pkFightSwitch = document.getElementById('pk-fight-switch');
const lblSelectedAcc = document.getElementById('lbl-selected-acc');
const accSettingsPanel = document.getElementById('acc-settings-panel');
const selSide = document.getElementById('sel-side');
const chkLac1 = document.getElementById('chk-lac1');
const chkLac2 = document.getElementById('chk-lac2');
const chkLac3 = document.getElementById('chk-lac3');
const btnSaveAcc = document.getElementById('btn-save-acc');

// State
let devicesMap = new Map(); // id -> { name, status, info, tkConfig }
let currentSelectedDeviceId = null;

function addLog(msg, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.innerText = msg;
  globalLogContainer.appendChild(entry);
  globalLogContainer.scrollTop = globalLogContainer.scrollHeight;
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
      newMap.set(d.id, { connected: false, info: null, tkConfig: { side: 'auto', lacs: [] } });
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
      selectDevice(id);
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
    nameSpan.innerText = nameText;
    tdName.appendChild(nameSpan);
    
    // Level
    const tdLevel = document.createElement('td');
    tdLevel.innerText = (dev.info && dev.info.level) ? dev.info.level : '';
    
    // Sect
    const tdSect = document.createElement('td');
    tdSect.innerText = (dev.info && dev.info.sectName) ? dev.info.sectName : '';
    
    // Status
    const tdStatus = document.createElement('td');
    const statusSpan = document.createElement('span');
    statusSpan.className = dev.connected ? 'text-blue' : '';
    if (dev.info && dev.info.error) {
      statusSpan.style.color = 'red';
      statusSpan.innerText = 'Lỗi';
    } else if (dev.info && dev.info.mapId) {
      statusSpan.innerText = `Bản đồ (${dev.info.mapId})`;
    } else {
      statusSpan.innerText = dev.connected ? 'Đang đọc...' : 'Chờ';
    }
    tdStatus.appendChild(statusSpan);
    
    tr.appendChild(tdToggle);
    tr.appendChild(tdName);
    tr.appendChild(tdLevel);
    tr.appendChild(tdSect);
    tr.appendChild(tdStatus);
    deviceTableBody.appendChild(tr);
  }
}

// Select Device Logic
function selectDevice(id) {
  currentSelectedDeviceId = id;
  renderTable(); // Update selection styling
  
  if (!id || !devicesMap.has(id)) {
    lblSelectedAcc.innerText = 'Chưa chọn';
    accSettingsPanel.style.display = 'none';
    return;
  }
  
  const dev = devicesMap.get(id);
  const name = (dev.info && dev.info.name) ? dev.info.name : id;
  lblSelectedAcc.innerText = name;
  accSettingsPanel.style.display = 'block';
  
  // Load config
  const cfg = dev.tkConfig;
  selSide.value = cfg.side || 'auto';
  chkLac1.checked = cfg.lacs.includes('45');
  chkLac2.checked = cfg.lacs.includes('51');
  chkLac3.checked = cfg.lacs.includes('50');
}

// Save Acc Settings
btnSaveAcc.addEventListener('click', () => {
  if (!currentSelectedDeviceId) return;
  const dev = devicesMap.get(currentSelectedDeviceId);
  if (!dev) return;
  
  const lacs = [];
  if (chkLac1.checked) lacs.push('45');
  if (chkLac2.checked) lacs.push('51');
  if (chkLac3.checked) lacs.push('50');
  
  dev.tkConfig = {
    side: selSide.value,
    lacs: lacs
  };
  
  updateGlobalTK();
  addLog(`[${currentSelectedDeviceId}] Đã lưu cấu hình Tống Kim.`, 'info');
});

document.getElementById('btn-test-npc1').addEventListener('click', () => {
  const devId = getTestDeviceId();
  if (devId) window.api.testNpc(devId, 0);
});

document.getElementById('btn-test-npc2').addEventListener('click', () => {
  const devId = getTestDeviceId();
  if (devId) window.api.testNpc(devId, 1);
});

function getTestDeviceId() {
  if (currentSelectedDeviceId) return currentSelectedDeviceId;
  const keys = Array.from(devicesMap.keys());
  if (keys.length > 0) return keys[0];
  addLog('[System] Vui lòng kết nối ít nhất 1 thiết bị để test.', 'error');
  return null;
}

const btnCustom1 = document.getElementById('btn-test-custom-1');
if (btnCustom1) {
  btnCustom1.addEventListener('click', () => {
    const devId = getTestDeviceId();
    if (devId) window.api.testNpc(devId, 0);
  });
}
const btnCustom2 = document.getElementById('btn-test-custom-2');
if (btnCustom2) {
  btnCustom2.addEventListener('click', () => {
    const devId = getTestDeviceId();
    if (devId) window.api.testNpc(devId, 1);
  });
}

// Auto TK Logic
function updateGlobalTK() {
  const enable = pkFightSwitch.checked;
  const tkConfigs = {};
  for (const [id, dev] of devicesMap.entries()) {
    if (dev.tkConfig) tkConfigs[id] = dev.tkConfig;
  }
  window.api.toggleAutoTK(enable, tkConfigs);
}

pkFightSwitch.addEventListener('change', updateGlobalTK);

// Top Buttons
btnRefresh.addEventListener('click', scanDevices);
btnRestart.addEventListener('click', () => {
  addLog('[System] Khởi động lại toàn bộ kết nối...', 'warn');
  for (const [id, dev] of devicesMap.entries()) {
    if (dev.connected) {
      dev.connected = false;
      window.api.toggleDevice(id, false);
    }
  }
  pkFightSwitch.checked = false;
  updateGlobalTK();
  setTimeout(scanDevices, 1000);
});

// Auto TK Logic
// ...
const btnScanDatau = document.getElementById('btn-scan-datau');
const txtDatauKeyword = document.getElementById('txt-datau-keyword');
const selDatauSeries = document.getElementById('sel-datau-series');
const txtDatauLevel = document.getElementById('txt-datau-level');
const selDatauType = document.getElementById('sel-datau-type');
const selDatauGender = document.getElementById('sel-datau-gender');
const datauResultsBody = document.getElementById('datau-results-body');

const SERIES_ICONS = {
  0: 'Vô', 1: '🟡 Kim', 2: '🟢 Mộc', 3: '🔵 Thủy', 4: '🔴 Hỏa', 5: '🟤 Thổ'
};

if (btnScanDatau) {
  btnScanDatau.addEventListener('click', async () => {
    const devId = getTestDeviceId();
    if (!devId) return;
    
    const keyword = txtDatauKeyword.value.trim();
    const filters = {
      series: parseInt(selDatauSeries.value) || -1,
      level: txtDatauLevel.value ? parseInt(txtDatauLevel.value) : -1,
      itemType: parseInt(selDatauType.value) || -1,
      gender: selDatauGender.value || 'all'
    };
    
    datauResultsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: blue;">Đang quét các sạp hàng xung quanh... Vui lòng chờ...</td></tr>';
    btnScanDatau.disabled = true;
    
    // Đăng ký nghe progress
    window.api.onScanDatauProgress((msg) => {
      datauResultsBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: blue;">${msg}</td></tr>`;
    });
    
    try {
      const res = await window.api.scanDatau(devId, keyword, filters);
      if (res && res.ok) {
        if (res.items && res.items.length > 0) {
          datauResultsBody.innerHTML = '';
          res.items.forEach(item => {
            const tr = document.createElement('tr');
            const seriesStr = SERIES_ICONS[item.series] || '?';
            tr.innerHTML = `
              <td>${item.shopName}</td>
              <td style="color: purple; font-weight: bold;">
                ${item.itemName} <br/>
                <span style="font-size: 9px; color: gray;">[Cấp ${item.level} | ${seriesStr}]</span>
              </td>
              <td style="color: #d35400;">${item.money}</td>
              <td>${item.shopLocation}</td>
            `;
            datauResultsBody.appendChild(tr);
          });
        } else {
          datauResultsBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #888;">Không tìm thấy vật phẩm nào khớp với "${keyword}".</td></tr>`;
        }
      } else {
        datauResultsBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: red;">Lỗi quét: ${res ? res.error : 'Unknown'}</td></tr>`;
      }
    } catch(e) {
      datauResultsBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: red;">Ngoại lệ: ${e.message}</td></tr>`;
    }
    btnScanDatau.disabled = false;
  });
}

// Init
scanDevices();
