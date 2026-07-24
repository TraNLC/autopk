// UI Elements
const btnRefresh = document.getElementById('btn-refresh');
const btnRestart = document.getElementById('btn-restart');
const deviceTableBody = document.getElementById('device-table-body');
const globalLogContainer = document.getElementById('global-log-container');

// TK Settings Elements
const btnToggleAutoTk = document.getElementById('btn-toggle-auto-tk');
const lblSelectedAcc = document.getElementById('lbl-selected-acc');
const accSettingsPanel = document.getElementById('acc-settings-panel');
const radSides = document.querySelectorAll('input[name="rad-side"]');
const chkLac1 = document.getElementById('chk-lac1');
const chkLac2 = document.getElementById('chk-lac2');
const chkLac3 = document.getElementById('chk-lac3');
const selLacInterval = document.getElementById('sel-lac-interval');

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

    const tdStatus = document.createElement('td');
    const statusSpan = document.createElement('span');
    statusSpan.className = dev.connected ? 'text-blue' : '';
    if (dev.info && dev.info.error) {
      statusSpan.style.color = 'red';
      statusSpan.innerText = 'Lỗi';
    } else if (dev.info && dev.info.mapId) {
      const TK_MAPS = [323, 324, 325, 379, 382, 972, 44, 375, 376, 377, 580, 581, 868, 869, 870, 879, 880, 881, 883, 884, 885, 902, 903, 904, 988];
      const mapNameLower = dev.info.mapName ? dev.info.mapName.toLowerCase() : '';
      if (mapNameLower.includes('báo danh') || mapNameLower.includes('bao danh')) {
        statusSpan.innerText = 'Báo danh TK';
        statusSpan.style.color = '#3498db'; // blue
      } else if (TK_MAPS.includes(dev.info.mapId) || mapNameLower.includes('doanh') || mapNameLower.includes('tống kim')) {
        statusSpan.innerText = 'Đánh TK';
        statusSpan.style.color = '#27ae60'; // green
      } else {
        statusSpan.innerText = 'Chờ TK';
        statusSpan.style.color = '#e67e22'; // orange
      }
      statusSpan.style.fontWeight = 'bold';
    } else {
      statusSpan.innerText = dev.connected ? 'Đang đọc...' : 'Chờ';
    }
    tdStatus.appendChild(statusSpan);
    
    tr.appendChild(tdToggle);
    tr.appendChild(tdName);
    tr.appendChild(tdLevel);
    tr.appendChild(tdSect);
    tr.appendChild(tdScore);
    tr.appendChild(tdStatus);

    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, id, dev);
    });

    deviceTableBody.appendChild(tr);
  }
}

let activeContextMenu = null;

function showContextMenu(x, y, id, dev) {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
  const menu = document.createElement('div');
  menu.className = 'custom-context-menu';
  menu.style.position = 'absolute';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.zIndex = '99999';
  menu.style.background = '#2c3e50';
  menu.style.border = '1px solid #34495e';
  menu.style.borderRadius = '6px';
  menu.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
  menu.style.padding = '5px 0';
  menu.style.minWidth = '150px';

  const item = document.createElement('div');
  item.className = 'context-menu-item';
  item.style.padding = '8px 15px';
  item.style.cursor = 'pointer';
  item.style.color = '#ecf0f1';
  item.style.display = 'flex';
  item.style.alignItems = 'center';
  item.style.justifyContent = 'space-between';
  item.style.fontSize = '13px';
  item.style.transition = 'background 0.2s';
  
  item.addEventListener('mouseenter', () => {
    item.style.background = '#2980b9';
  });
  item.addEventListener('mouseleave', () => {
    item.style.background = 'transparent';
  });

  const isFightTop1 = !!(dev.tkConfig && dev.tkConfig.fightTop1);
  item.innerHTML = `<span>Đánh Top 1</span> <input type="checkbox" ${isFightTop1 ? 'checked' : ''} style="margin-left: 10px; cursor: pointer;">`;

  item.addEventListener('click', () => {
    if (!dev.tkConfig) {
      dev.tkConfig = { side: 'auto', lacs: ['45', '51', '50'], autoBaoDanh: true };
    }
    dev.tkConfig.fightTop1 = !isFightTop1;
    updateGlobalTK();
    renderTable();
    menu.remove();
    activeContextMenu = null;
  });

  menu.appendChild(item);
  document.body.appendChild(menu);
  activeContextMenu = menu;
}

document.addEventListener('click', (e) => {
  if (activeContextMenu && !activeContextMenu.contains(e.target)) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
});

const lblSelectedAccGlobals = document.querySelectorAll('.lbl-selected-acc-global');

function selectDevice(id) {
  currentSelectedDeviceId = id;
  renderTable(); 
  
  const name = (id && devicesMap.has(id)) 
    ? ((devicesMap.get(id).info && devicesMap.get(id).info.name) ? devicesMap.get(id).info.name : id) 
    : 'Chưa chọn';
  
  lblSelectedAcc.innerText = name;
  lblSelectedAccGlobals.forEach(el => {
    el.innerText = name;
  });
  
  renderLogsForSelectedDevice(id);
  
  if (!id || !devicesMap.has(id)) {
    radSides.forEach(rb => rb.checked = (rb.value === 'auto'));
    chkLac1.checked = true;
    chkLac2.checked = true;
    chkLac3.checked = true;
    return;
  }
  
  const dev = devicesMap.get(id);
  const cfg = dev.tkConfig || { side: 'auto', lacs: [], lacInterval: 180 };
  radSides.forEach(rb => rb.checked = (rb.value === (cfg.side || 'auto')));
  chkLac1.checked = cfg.lacs ? cfg.lacs.includes('45') : false;
  chkLac2.checked = cfg.lacs ? cfg.lacs.includes('51') : false;
  chkLac3.checked = cfg.lacs ? cfg.lacs.includes('50') : false;
  
  if (selLacInterval) {
    selLacInterval.value = cfg.lacInterval ? cfg.lacInterval.toString() : '180';
  }
}

function saveConfigForSelected() {
  if (!currentSelectedDeviceId) return;
  const dev = devicesMap.get(currentSelectedDeviceId);
  if (!dev) return;
  
  dev.tkConfig = dev.tkConfig || {};
  
  let selectedSide = 'auto';
  radSides.forEach(rb => {
    if (rb.checked) selectedSide = rb.value;
  });
  dev.tkConfig.side = selectedSide;
  
  const lacs = [];
  if (chkLac1.checked) lacs.push('45');
  if (chkLac2.checked) lacs.push('51');
  if (chkLac3.checked) lacs.push('50');
  dev.tkConfig.lacs = lacs;
  
  if (selLacInterval) {
    dev.tkConfig.lacInterval = parseInt(selLacInterval.value) || 180;
  }
  
  updateGlobalTK();
  
  // Create a descriptive log message
  const sideName = selectedSide === 'song' ? 'Tống' : (selectedSide === 'jin' ? 'Kim' : 'Tự động');
  const lacNames = [];
  if (lacs.includes('45')) lacNames.push('Phi tốc');
  if (lacs.includes('51')) lacNames.push('Lệnh bài');
  if (lacs.includes('50')) lacNames.push('Chiến cổ');
  const lacsStr = lacNames.length > 0 ? lacNames.join(', ') : 'Không dùng';
  let lacIntervalText = '';
  if (lacs.length > 0) {
    lacIntervalText = ` (${dev.tkConfig.lacInterval / 60} phút)`;
  }
  
  addLog(`[${currentSelectedDeviceId}] Lưu cấu hình: Phe ${sideName} | Lắc: ${lacsStr}${lacIntervalText}`, 'info');
}

radSides.forEach(rb => rb.addEventListener('change', saveConfigForSelected));
if (chkLac1) chkLac1.addEventListener('change', saveConfigForSelected);
if (chkLac2) chkLac2.addEventListener('change', saveConfigForSelected);
if (chkLac3) chkLac3.addEventListener('change', saveConfigForSelected);
if (selLacInterval) selLacInterval.addEventListener('change', saveConfigForSelected);
const chkBaoDanh = document.getElementById('chk-auto-baodanh');
if (chkBaoDanh) chkBaoDanh.addEventListener('change', saveConfigForSelected);

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
console.log('[Frontend] UI Loaded. Calling scanDevices()...');
setTimeout(() => {
  addLog('[System] Đang khởi tạo và tìm kiếm giả lập...', 'info');
}, 500);
scanDevices();