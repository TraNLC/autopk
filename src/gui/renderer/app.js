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

    // Status
    const tdStatus = document.createElement('td');
    const statusSpan = document.createElement('span');
    statusSpan.className = dev.connected ? 'text-blue' : '';
    if (dev.info && dev.info.error) {
      statusSpan.style.color = 'red';
      statusSpan.innerText = 'Lỗi';
    } else if (dev.info && dev.info.mapId) {
      let mapName = dev.info.mapName ? dev.info.mapName : `Bản đồ (${dev.info.mapId})`;
      const BATTLE_MAPS = [44, 375, 376, 377, 580, 581, 868, 869, 870, 879, 880, 881, 883, 884, 885, 902, 903, 904, 988];
      if (BATTLE_MAPS.includes(dev.info.mapId)) {
        let isMax = false;
        if (dev.tkConfig && dev.tkConfig.stopMaxScore === true && dev.info.tkScore !== undefined && dev.info.tkScore >= 30000) {
          isMax = true;
        }

        if (isMax) {
          mapName = 'Đã đạt Max Điểm';
          statusSpan.style.color = '#27ae60'; // green color for success
        } else {
          mapName = 'Đang đánh TK';
          statusSpan.style.color = '#e67e22'; // distinct color for battle
        }
        statusSpan.style.fontWeight = 'bold';
      }
      statusSpan.innerText = mapName;
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

    // Right-click listener for context menu
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

// Close context menu on general click
document.addEventListener('click', (e) => {
  if (activeContextMenu && !activeContextMenu.contains(e.target)) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
});

// Select Device Logic
const lblSelectedAccGlobals = document.querySelectorAll('.lbl-selected-acc-global');

function selectDevice(id) {
  currentSelectedDeviceId = id;
  renderTable(); // Update selection styling
  
  const name = (id && devicesMap.has(id)) 
    ? ((devicesMap.get(id).info && devicesMap.get(id).info.name) ? devicesMap.get(id).info.name : id) 
    : 'Chua chon';
  
  lblSelectedAcc.innerText = name;
  lblSelectedAccGlobals.forEach(el => {
    el.innerText = name;
  });
  
  // Kết xuất lại logs của thiết bị được chọn
  renderLogsForSelectedDevice(id);
  
  if (!id || !devicesMap.has(id)) {
    selSide.value = 'auto';
    chkLac1.checked = true;
    chkLac2.checked = true;
    chkLac3.checked = true;
    const chkBaoDanh = document.getElementById('chk-auto-baodanh');
    if (chkBaoDanh) chkBaoDanh.checked = true;
    return;
  }
  
  const dev = devicesMap.get(id);
  
  // Load config
  const cfg = dev.tkConfig || { side: 'auto', lacs: [], autoBaoDanh: true };
  selSide.value = cfg.side || 'auto';
  chkLac1.checked = cfg.lacs ? cfg.lacs.includes('45') : false;
  chkLac2.checked = cfg.lacs ? cfg.lacs.includes('51') : false;
  chkLac3.checked = cfg.lacs ? cfg.lacs.includes('50') : false;
  
  const chkBaoDanh = document.getElementById('chk-auto-baodanh');
  if (chkBaoDanh) {
    chkBaoDanh.checked = cfg.autoBaoDanh !== false;
  }

  const chkStopMaxScore = document.getElementById('chk-stop-max-score');
  if (chkStopMaxScore) {
    chkStopMaxScore.checked = !!cfg.stopMaxScore;
  }
}

// Save Acc Settings
btnSaveAcc.addEventListener('click', () => {
  if (!currentSelectedDeviceId) return;
  const dev = devicesMap.get(currentSelectedDeviceId);
  if (!dev) return;
  
  dev.tkConfig = dev.tkConfig || {};
  dev.tkConfig.side = selSide.value;
  
  const chkBaoDanh = document.getElementById('chk-auto-baodanh');
  if (chkBaoDanh) {
    dev.tkConfig.autoBaoDanh = chkBaoDanh.checked;
  }

  const chkStopMaxScore = document.getElementById('chk-stop-max-score');
  if (chkStopMaxScore) {
    dev.tkConfig.stopMaxScore = chkStopMaxScore.checked;
  }
  
  const lacs = [];
  if (chkLac1.checked) lacs.push('45');
  if (chkLac2.checked) lacs.push('51');
  if (chkLac3.checked) lacs.push('50');
  dev.tkConfig.lacs = lacs;
  
  updateGlobalTK();
  addLog(`[${currentSelectedDeviceId}] Da luu cau hinh nhan vat.`, 'success');
});

// Collect Points (Gom Diem)
const btnCollectPoints = document.getElementById('btn-collect-points');
if (btnCollectPoints) {
  btnCollectPoints.addEventListener('click', async () => {
    if (!currentSelectedDeviceId) {
      addLog('Chua chon nhan vat de thuc hien gom diem.', 'error');
      return;
    }
    btnCollectPoints.disabled = true;
    const oldText = btnCollectPoints.innerText;
    btnCollectPoints.innerText = 'Dang Gom Diem...';
    try {
      const res = await window.api.collectPoints(currentSelectedDeviceId);
      if (res && res.ok) {
        addLog(`[${currentSelectedDeviceId}] Gom diem hoan tat!`, 'success');
      } else {
        addLog(`[${currentSelectedDeviceId}] Gom diem that bai: ${res ? res.error : 'Loi khong xac dinh'}`, 'error');
      }
    } catch(e) {
      addLog(`[${currentSelectedDeviceId}] Loi: ${e.message}`, 'error');
    } finally {
      btnCollectPoints.disabled = false;
      btnCollectPoints.innerText = oldText;
    }
  });
}



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
    
    const loadingText = document.getElementById('datau-loading-text');
    if (loadingText) {
      loadingText.innerText = 'Đang quét các sạp hàng xung quanh... Vui lòng chờ...';
      loadingText.style.color = 'blue';
    }
    btnScanDatau.disabled = true;
    
    // Đăng ký nghe progress
    window.api.onScanDatauProgress((msg) => {
      if (loadingText) loadingText.innerText = msg;
    });
    
    try {
      const limitInput = document.getElementById('num-shops-to-scan');
      const limit = limitInput ? (parseInt(limitInput.value, 10) || 50) : 50;
      
      const kwInput = document.getElementById('txt-datau-keyword');
      const keyword = kwInput ? kwInput.value.trim() : '';

      // Scan with optional keyword
      const res = await window.api.scanDatau(devId, keyword, { series: -1, level: -1, itemType: -1, gender: 'all', limit });
      if (res && res.ok) {
        if (loadingText) {
          loadingText.innerText = `Quét xong! Tìm thấy ${res.items ? res.items.length : 0} vật phẩm. Mở cửa sổ chi tiết...`;
          loadingText.style.color = 'green';
        }
        
        if (res.items && res.items.length > 0) {
          // Send to main process to open the global shop detail window
          window.api.showAllShopsDetail({
            devId: devId,
            items: res.items,
            mapId: devicesMap.has(devId) && devicesMap.get(devId).info ? devicesMap.get(devId).info.mapId : 0
          });
        } else {
          if (loadingText) {
            loadingText.innerText = 'Không tìm thấy vật phẩm nào xung quanh.';
            loadingText.style.color = '#888';
          }
        }
      } else {
        if (loadingText) {
          loadingText.innerText = `Lỗi quét: ${res ? res.error : 'Unknown'}`;
          loadingText.style.color = 'red';
        }
      }
    } catch(e) {
      if (loadingText) {
        loadingText.innerText = `Ngoại lệ: ${e.message}`;
        loadingText.style.color = 'red';
      }
    }
    btnScanDatau.disabled = false;
  });
}

const btnScan5Hanh = document.getElementById('btn-scan-5hanh');
if (btnScan5Hanh) {
  btnScan5Hanh.addEventListener('click', async () => {
    const devId = getTestDeviceId();
    if (!devId) return;
    
    const loadingText = document.getElementById('5hanh-loading-text');
    if (loadingText) {
      loadingText.innerText = 'Đang quét sạp hàng xung quanh để lọc Ngũ Hành... Vui lòng chờ...';
      loadingText.style.color = 'blue';
    }
    btnScan5Hanh.disabled = true;
    
    window.api.onScanDatauProgress((msg) => {
      if (loadingText) loadingText.innerText = msg;
    });
    
    try {
      const res = await window.api.scanDatau(devId, '', { series: -1, level: -1, itemType: -1, gender: 'all' });
      if (res && res.ok) {
        if (loadingText) {
          loadingText.innerText = `Quét xong! Lọc được ${res.items ? res.items.length : 0} trang bị. Đang hiển thị bảng Ngũ Hành...`;
          loadingText.style.color = 'green';
        }
        
        if (res.items && res.items.length > 0) {
          window.api.show5HanhDetail({
            devId: devId,
            items: res.items,
            mapId: devicesMap.has(devId) && devicesMap.get(devId).info ? devicesMap.get(devId).info.mapId : 0
          });
        } else {
          if (loadingText) {
            loadingText.innerText = 'Không tìm thấy trang bị nào xung quanh.';
            loadingText.style.color = '#888';
          }
        }
      } else {
        if (loadingText) {
          loadingText.innerText = `Lỗi quét: ${res ? res.error : 'Unknown'}`;
          loadingText.style.color = 'red';
        }
      }
    } catch(e) {
      if (loadingText) {
        loadingText.innerText = `Ngoại lệ: ${e.message}`;
        loadingText.style.color = 'red';
      }
    }
    btnScan5Hanh.disabled = false;
  });
}

// Init
scanDevices();

// Helpers
function getTestDeviceId() {
  if (currentSelectedDeviceId) return currentSelectedDeviceId;
  for (const [id, dev] of devicesMap.entries()) {
    if (dev.connected) return id;
  }
  addLog('Chưa chọn nhân vật hoặc chưa kết nối giả lập nào.', 'error');
  return null;
}

// --- Auto Login Tab Logic ---
const btnAutoLogin = document.getElementById('btn-auto-login');
const txtAccountsList = document.getElementById('txt-accounts-list');

// Load danh sach tai khoan tu localStorage luc khoi dong
if (txtAccountsList) {
  const saved = localStorage.getItem('auto_login_accounts_list');
  if (saved) {
    txtAccountsList.value = saved;
  }
  txtAccountsList.addEventListener('input', () => {
    localStorage.setItem('auto_login_accounts_list', txtAccountsList.value);
  });
}

if (btnAutoLogin) {
  btnAutoLogin.addEventListener('click', async () => {
    if (!currentSelectedDeviceId) {
      addLog('Chua chon nhan vat/thiet bi de dang nhap.', 'error');
      return;
    }

    const rawList = txtAccountsList ? txtAccountsList.value : '';
    const lines = rawList.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      addLog('Vui long nhap hoac dan danh sach tai khoan.', 'error');
      return;
    }

    // Tim index cua thiet bi hien tai trong danh sach thiet bi da quet duoc
    const deviceIds = Array.from(devicesMap.keys());
    const devIdx = deviceIds.indexOf(currentSelectedDeviceId);

    if (devIdx === -1) {
      addLog('Loi: Thiet bi dang chon khong hop le.', 'error');
      return;
    }

    if (devIdx >= lines.length) {
      addLog(`Loi: So luong tai khoan da nhap (${lines.length}) it hon chi muc thiet bi (${devIdx + 1}).`, 'error');
      return;
    }

    // Doc tai khoan & mat khau o dong tuong ung
    const credentialsLine = lines[devIdx];
    const parts = credentialsLine.split(/\s+/);
    if (parts.length < 2) {
      addLog(`Loi: Dong thu ${devIdx + 1} khong dung dinh dang (TaiKhoan MatKhau).`, 'error');
      return;
    }

    const username = parts[0];
    const password = parts[1];

    addLog(`[${currentSelectedDeviceId}] Bắt đầu Auto Login cho dòng ${devIdx + 1}: ${username}...`, 'info');
    btnAutoLogin.disabled = true;
    
    const statusCard = document.getElementById('login-status-card');
    const lblStatus = document.getElementById('lbl-login-status');
    
    const updateStatusUI = (type, msg) => {
      if (!statusCard) return;
      statusCard.style.display = 'block';
      statusCard.className = `status-card ${type}`;
      lblStatus.innerText = msg;
    };
    
    updateStatusUI('', 'Đang khởi tạo kết nối...');

    let attempts = 0;
    const maxAttempts = 30; // Max ~75 seconds
    const interval = setInterval(async () => {
      try {
        attempts++;
        const res = await window.api.performAutoLogin(currentSelectedDeviceId, username, password);
        
        if (res && res.state) {
          if (res.state === 'ERROR') {
            addLog(`[${currentSelectedDeviceId}] Lỗi AutoLogin: ${res.error}`, 'error');
            updateStatusUI('error', `Lỗi: ${res.error}`);
            // If it's the first attempt and fails, maybe the device isn't connected
            if (attempts === 1 && res.error.includes('chua ket noi')) {
              alert(`Lỗi: Thiết bị chưa được kết nối!\nVui lòng check vào ô vuông bên cạnh tên thiết bị ở danh sách phía trên để kết nối trước khi Đăng nhập.`);
            }
            clearInterval(interval);
            btnAutoLogin.disabled = false;
          } else if (res.state === 'STATE_IN_GAME') {
            addLog(`[${currentSelectedDeviceId}] Tuyệt vời! Đã vào game an toàn.`, 'success');
            updateStatusUI('success', 'Tuyệt vời! Đã vào game an toàn.');
            clearInterval(interval);
            btnAutoLogin.disabled = false;
          } else if (res.state !== 'STATE_UNKNOWN') {
            addLog(`[${currentSelectedDeviceId}] Tiến trình: ${res.msg}`, 'system');
            updateStatusUI('', res.msg);
          } else {
            updateStatusUI('', res.msg || 'Đang chờ load màn hình...');
          }
        } else {
          addLog(`[${currentSelectedDeviceId}] Phản hồi không xác định.`, 'warn');
          updateStatusUI('error', 'Phản hồi không xác định từ hệ thống.');
        }

        if (attempts >= maxAttempts) {
          addLog(`[${currentSelectedDeviceId}] Hết thời gian chờ Auto Login. Hãy kiểm tra lại game.`, 'error');
          updateStatusUI('error', 'Hết thời gian chờ Auto Login.');
          clearInterval(interval);
          btnAutoLogin.disabled = false;
        }
      } catch(e) {
        addLog(`[${currentSelectedDeviceId}] Ngoại lệ vòng lặp: ${e.message}`, 'error');
        updateStatusUI('error', `Ngoại lệ: ${e.message}`);
        clearInterval(interval);
        btnAutoLogin.disabled = false;
      }
    }, 2500); // Tick every 2.5 seconds
  });
}

// ----------------------------------------------------
// Full Auto Launch (MuMu Player) - Interactive Table
// ----------------------------------------------------
const accTableBody = document.getElementById('acc-table-body');
const btnAddAccRow = document.getElementById('btn-add-acc-row');
const btnImportAcc = document.getElementById('btn-import-acc');

function createAccRow(slot, user = '', pass = '') {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="text-align: center; font-weight: bold;">${slot}</td>
    <td><input type="text" class="input-acc" value="${user}" placeholder="Tài khoản"></td>
    <td><input type="password" class="input-pass" value="${pass}" placeholder="Mật khẩu"></td>
    <td style="text-align: center;">
      <button class="btn-start-acc" title="Start">▶</button>
      <button class="btn-stop-acc" title="Stop">⏹</button>
      <button class="btn-del-acc" title="Delete">✖</button>
    </td>
  `;
  
  const btnDel = tr.querySelector('.btn-del-acc');
  btnDel.addEventListener('click', () => {
    tr.remove();
    updateSlots();
  });

  const btnStart = tr.querySelector('.btn-start-acc');
  btnStart.addEventListener('click', () => handleStartRow(tr));
  
  // Stop button implementation depends on backend logic (e.g. killing the mumu instance)
  // For now, it will just alert or try to kill the ADB session.
  const btnStop = tr.querySelector('.btn-stop-acc');
  btnStop.addEventListener('click', () => {
      alert('Đang cập nhật tính năng Stop Giả Lập!');
  });

  return tr;
}

function updateSlots() {
  if (!accTableBody) return;
  const rows = accTableBody.querySelectorAll('tr');
  rows.forEach((row, idx) => {
    row.children[0].innerText = idx + 1;
  });
}

if (accTableBody) {
  // Init one empty row
  accTableBody.appendChild(createAccRow(1));

  if (btnAddAccRow) {
    btnAddAccRow.addEventListener('click', () => {
      const slot = accTableBody.children.length + 1;
      accTableBody.appendChild(createAccRow(slot));
    });
  }

  if (btnImportAcc) {
    btnImportAcc.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text || text.trim() === '') {
          alert('Chưa có dữ liệu copy trong bộ nhớ. Vui lòng copy 2 cột (User Pass) từ Excel trước.');
          return;
        }
        
        const lines = text.split('\\n').map(l => l.trim()).filter(l => l !== '');
        // Clear existing empty rows if any
        if (accTableBody.children.length === 1) {
          const firstRow = accTableBody.children[0];
          const user = firstRow.querySelector('.input-acc').value;
          if (!user) firstRow.remove();
        }

        let currentSlot = accTableBody.children.length + 1;
        lines.forEach(line => {
          const parts = line.split(/\\s+/);
          if (parts.length >= 2) {
            accTableBody.appendChild(createAccRow(currentSlot, parts[0], parts[1]));
            currentSlot++;
          }
        });
        alert(`Đã dán thành công ${lines.length} dòng!`);
      } catch (err) {
        alert('Lỗi đọc clipboard: ' + err.message);
      }
    });
  }
}

async function handleStartRow(tr) {
  const user = tr.querySelector('.input-acc').value.trim();
  const pass = tr.querySelector('.input-pass').value.trim();
  const slot = parseInt(tr.children[0].innerText, 10);
  
  if (!user || !pass) {
    alert('Vui lòng nhập đủ Tài khoản và Mật khẩu.');
    return;
  }

  const txtMumuPath = document.getElementById('txt-mumu-path');
  const mumuPath = txtMumuPath ? txtMumuPath.value.trim() : '';
  if (!mumuPath) {
    alert('Vui lòng nhập đường dẫn MuMuManager.exe');
    return;
  }

  const index = slot - 1;
  const port = 16384 + (index * 32);
  const btnStart = tr.querySelector('.btn-start-acc');
  
  btnStart.disabled = true;
  const statusCard = document.getElementById('login-status-card');
  const lblStatus = document.getElementById('lbl-login-status');
  
  const updateStatusUI = (type, msg) => {
    if (!statusCard) return;
    statusCard.style.display = 'block';
    statusCard.className = `status-card ${type}`;
    lblStatus.innerText = msg;
  };
  
  updateStatusUI('', `Khởi động MuMu ${index} cho acc ${user}...`);
  
  try {
    const res = await window.api.performFullAutoLaunch(mumuPath, user, pass, port, index);
    if (res && res.ok) {
        updateStatusUI('success', `Đã mở game, bắt đầu Đăng Nhập...`);
        let deviceId = res.deviceId; 
        
        let attempts = 0;
        const maxAttempts = 30;
        const interval = setInterval(async () => {
          try {
            attempts++;
            const resLogin = await window.api.performAutoLogin(deviceId, user, pass);
            
            if (resLogin && resLogin.state) {
              if (resLogin.state === 'ERROR') {
                updateStatusUI('error', `Lỗi: ${resLogin.error}`);
                clearInterval(interval);
                btnStart.disabled = false;
              } else if (resLogin.state === 'STATE_IN_GAME') {
                updateStatusUI('success', 'Tuyệt vời! Đã vào game an toàn.');
                clearInterval(interval);
                btnStart.disabled = false;
              } else if (resLogin.state !== 'STATE_UNKNOWN') {
                updateStatusUI('', resLogin.msg);
              } else {
                updateStatusUI('', resLogin.msg || 'Đang chờ màn hình...');
              }
            } else {
              updateStatusUI('error', 'Phản hồi lạ.');
            }

            if (attempts >= maxAttempts) {
              updateStatusUI('error', 'Hết thời gian chờ.');
              clearInterval(interval);
              btnStart.disabled = false;
            }
          } catch(e) {
            updateStatusUI('error', `Ngoại lệ: ${e.message}`);
            clearInterval(interval);
            btnStart.disabled = false;
          }
        }, 2500);

    } else {
        updateStatusUI('error', res.error || 'Lỗi không xác định.');
        btnStart.disabled = false;
    }
  } catch(e) {
    updateStatusUI('error', e.message);
    btnStart.disabled = false;
  }
}

