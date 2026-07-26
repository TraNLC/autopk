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
    if (deviceId === currentSelectedDeviceId) {
      updateItemCounts(info.itemCounts);
    }
  }
});

function updateItemCounts(counts) {
  counts = counts || { '45': 0, '51': 0, '50': 0 };
  const lbl45 = document.getElementById('lbl-count-45');
  const lbl51 = document.getElementById('lbl-count-51');
  const lbl50 = document.getElementById('lbl-count-50');
  if (lbl45) lbl45.innerText = `(${counts['45'] || 0})`;
  if (lbl51) lbl51.innerText = `(${counts['51'] || 0})`;
  if (lbl50) lbl50.innerText = `(${counts['50'] || 0})`;
}

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
    
    // Highlight if completed Tống Kim
    const isTkDone = dev.info && dev.info.tkScore >= 30000;
    if (isTkDone) {
      tr.style.backgroundColor = '#e8f5e9'; // light green highlight
      tr.title = 'Hoàn thành Tống Kim';
    }
    
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
    let nameText = `Chưa đăng nhập (${id})`;
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
      if (isTkDone) {
        statusSpan.innerText = 'Hoàn thành TK';
        statusSpan.style.color = '#e91e63'; // pink/red highlight for completion
        statusSpan.style.fontWeight = 'bold';
        statusSpan.innerHTML += ' <span style="font-size:10px;">🌟</span>';
      } else if (mapNameLower.includes('báo danh') || mapNameLower.includes('bao danh')) {
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
  const cfg = dev.tkConfig || { side: 'auto', lacs: [], lacInterval: 5 };
  radSides.forEach(rb => rb.checked = (rb.value === (cfg.side || 'auto')));
  
  const radUseLac = document.getElementsByName('rad-use-lac');
  const useLac = (cfg.lacs && cfg.lacs.length > 0) ? 'yes' : 'no';
  radUseLac.forEach(rb => rb.checked = (rb.value === useLac));
  const lacOptions = document.getElementById('lac-options');
  if (lacOptions) lacOptions.style.display = useLac === 'yes' ? 'block' : 'none';

  chkLac1.checked = cfg.lacs ? cfg.lacs.includes('45') : false;
  chkLac2.checked = cfg.lacs ? cfg.lacs.includes('51') : false;
  chkLac3.checked = cfg.lacs ? cfg.lacs.includes('50') : false;
  
  if (selLacInterval) {
    selLacInterval.value = cfg.lacInterval ? cfg.lacInterval.toString() : '5';
  }
  updateItemCounts(dev.info ? dev.info.itemCounts : null);
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
  let useLac = 'yes';
  const radUseLac = document.getElementsByName('rad-use-lac');
  radUseLac.forEach(rb => {
    if (rb.checked) useLac = rb.value;
  });

  if (useLac === 'yes') {
    if (chkLac1.checked) lacs.push('45');
    if (chkLac2.checked) lacs.push('51');
    if (chkLac3.checked) lacs.push('50');
  }
  dev.tkConfig.lacs = lacs;
  
  if (selLacInterval) {
    dev.tkConfig.lacInterval = parseInt(selLacInterval.value) || 5;
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
const radUseLacButtons = document.getElementsByName('rad-use-lac');
radUseLacButtons.forEach(rb => rb.addEventListener('change', saveConfigForSelected));
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

const btnUpdate = document.getElementById('btn-update');
const updateStatusText = document.getElementById('update-status-text');
if (btnUpdate) {
  btnUpdate.addEventListener('click', async () => {
    btnUpdate.disabled = true;
    updateStatusText.innerText = "Đang kết nối...";
    await window.api.checkForUpdates();
  });
}

window.api.onUpdateStatus((msg) => {
  if (updateStatusText) updateStatusText.innerText = msg;
  if (btnUpdate) {
    if (msg.includes('lỗi') || msg.includes('mới nhất')) {
      btnUpdate.disabled = false;
    }
  }
});
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

// ==========================================
// TABS & TEST NPC LOGIC
// ==========================================

// Tab Switching
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Xóa active hiện tại
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    // Gán active mới
    btn.classList.add('active');
    const targetId = btn.getAttribute('data-tab');
    document.getElementById(targetId).classList.add('active');
  });
});

// Test NPC Buttons
const btnTestScanNpc = document.getElementById('btn-test-scan-npc');
const btnTestSaveTxt = document.getElementById('btn-test-save-txt');
const testNpcTbody = document.getElementById('test-npc-tbody');
const btnTestMove = document.getElementById('btn-test-move');
const testInputX = document.getElementById('test-input-x');
const testInputY = document.getElementById('test-input-y');

let lastScannedNpcs = [];

if (btnTestScanNpc) {
  btnTestScanNpc.addEventListener('click', async () => {
    if (!currentSelectedDeviceId) {
      alert('Vui lòng chọn 1 tài khoản (click vào tên nhân vật bên trái) trước!');
      return;
    }
    
    btnTestScanNpc.innerText = 'Đang quét... (chờ 1s)';
    btnTestScanNpc.disabled = true;
    testNpcTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Đang phân tích gói tin mạng...</td></tr>';
    
    try {
      const res = await window.api.testNpcNetworkScan(currentSelectedDeviceId);
      btnTestScanNpc.innerText = '1. Quét NPC (Opcode 72)';
      btnTestScanNpc.disabled = false;
      
      if (res && res.ok && res.npcs && res.npcs.length > 0) {
        lastScannedNpcs = res.npcs;
        testNpcTbody.innerHTML = '';
        res.npcs.forEach(npc => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${npc.id || '-'}</td>
            <td><b>${npc.name || '-'}</b></td>
            <td style="color: blue; font-weight: bold; cursor: pointer;" title="Click để copy tọa độ" onclick="document.getElementById('test-input-x').value='${npc.x}'; document.getElementById('test-input-y').value='${npc.y}';">
              ${npc.x}, ${npc.y}
            </td>
            <td>${npc.mapId || '-'}</td>
          `;
          testNpcTbody.appendChild(tr);
        });
        btnTestSaveTxt.style.display = 'block';
      } else {
        testNpcTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #c0392b;">Không tìm thấy NPC nào quanh đây!</td></tr>';
        btnTestSaveTxt.style.display = 'none';
        lastScannedNpcs = [];
      }
    } catch (e) {
      btnTestScanNpc.innerText = '1. Quét NPC (Opcode 72)';
      btnTestScanNpc.disabled = false;
      testNpcTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: red;">Lỗi: ${e.message}</td></tr>`;
    }
  });
}

if (btnTestSaveTxt) {
  btnTestSaveTxt.addEventListener('click', async () => {
    if (lastScannedNpcs.length === 0) return;
    try {
      const res = await window.api.saveNpcCoordinates(lastScannedNpcs);
      if (res && res.ok) {
        alert('Đã lưu thành công tại:\n' + res.path);
      } else {
        alert('Lỗi lưu file: ' + (res ? res.error : 'Unknown'));
      }
    } catch(e) {
      alert('Exception: ' + e.message);
    }
  });
}

if (btnTestMove) {
  btnTestMove.addEventListener('click', async () => {
    if (!currentSelectedDeviceId) {
      alert('Vui lòng chọn tài khoản cần test Move!');
      return;
    }
    const x = parseInt(testInputX.value);
    const y = parseInt(testInputY.value);
    if (isNaN(x) || isNaN(y)) {
      alert('Tọa độ X và Y không hợp lệ!');
      return;
    }
    
    addLog(`[${currentSelectedDeviceId}] [Test] Gửi lệnh Move đến tọa độ (${x}, ${y})`, 'warn');
    await window.api.testMove(currentSelectedDeviceId, x, y);
  });
}

// ========== CHECK POSITION + SAVE NPC COORD ==========
let _savedPosX = 0, _savedPosY = 0, _savedPosMapId = 0, _savedPosCamp = 0;

const btnCheckPosition = document.getElementById('btn-check-position');
const lblCurrentPos = document.getElementById('lbl-current-pos');
const btnSaveNpcCoord = document.getElementById('btn-save-npc-coord');
const inputSaveNpcName = document.getElementById('input-save-npc-name');

if (btnCheckPosition) {
  btnCheckPosition.addEventListener('click', async () => {
    if (!currentSelectedDeviceId) {
      alert('Vui lòng chọn tài khoản trước!');
      return;
    }
    btnCheckPosition.disabled = true;
    btnCheckPosition.innerText = '...';
    try {
      const res = await window.api.getPlayerPosition(currentSelectedDeviceId);
      if (res && res.ok) {
        // Lấy phe từ radio button thay vì tự động nhận diện
        let pheValue = 1;
        const radPhe = document.getElementsByName('rad-save-phe');
        radPhe.forEach(rb => {
          if (rb.checked) pheValue = parseInt(rb.value);
        });

        _savedPosX = res.x;
        _savedPosY = res.y;
        _savedPosMapId = res.mapId;
        _savedPosCamp = pheValue; // Ghi đè phe bằng giá trị user chọn
        
        let pheStr = pheValue == 1 ? 'Tống' : 'Kim';
        const dev = devicesMap.get(currentSelectedDeviceId);
        let mapName = dev && dev.info && dev.info.mapName ? dev.info.mapName : `Map ${res.mapId}`;
        
        lblCurrentPos.innerText = `X: ${res.x}, Y: ${res.y}, Map: ${mapName}, Phe: ${pheStr}`;
        lblCurrentPos.style.color = '#28a745';
        // Tự điền vào ô X, Y của Move
        if (testInputX) testInputX.value = res.x;
        if (testInputY) testInputY.value = res.y;
      } else {
        lblCurrentPos.innerText = 'Lỗi: ' + (res ? res.error : 'Unknown');
        lblCurrentPos.style.color = '#dc3545';
      }
    } catch(e) {
      lblCurrentPos.innerText = 'Lỗi: ' + e.message;
      lblCurrentPos.style.color = '#dc3545';
    }
    btnCheckPosition.disabled = false;
    btnCheckPosition.innerText = '📍 Lấy vị trí';
  });
}

if (btnSaveNpcCoord) {
  btnSaveNpcCoord.addEventListener('click', async () => {
    // Hardcode tên NPC theo yêu cầu
    const npcName = "Trinh Sát";
    
    if (!_savedPosX || !_savedPosY) {
      alert('Vui lòng bấm "Lấy vị trí" trước để lấy tọa độ hiện tại!');
      return;
    }

    // Luôn đọc lại radio phe một lần nữa trước khi lưu để đảm bảo chính xác
    let pheValue = 1;
    const radPhe = document.getElementsByName('rad-save-phe');
    radPhe.forEach(rb => {
      if (rb.checked) pheValue = parseInt(rb.value);
    });
    _savedPosCamp = pheValue;
    try {
      const res = await window.api.saveNpcCoordsManual({
        npcName,
        x: _savedPosX,
        y: _savedPosY,
        mapId: _savedPosMapId,
        camp: _savedPosCamp
      });
      if (res && res.ok) {
        let phe = _savedPosCamp == 1 ? 'Tống' : _savedPosCamp == 2 ? 'Kim' : _savedPosCamp;
        addLog(`✅ Đã lưu tọa độ NPC "${npcName}" = (${_savedPosX}, ${_savedPosY}) map ${_savedPosMapId} Phe ${phe}`, 'success');
        btnSaveNpcCoord.innerText = '✅ Đã lưu!';
        setTimeout(() => { btnSaveNpcCoord.innerText = '💾 Lưu'; }, 2000);
      } else {
        alert('Lỗi lưu: ' + (res ? res.error : 'Unknown'));
      }
    } catch(e) {
      alert('Exception: ' + e.message);
    }
  });
}