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
      statusSpan.innerText = dev.info.mapName ? dev.info.mapName : `Bản đồ (${dev.info.mapId})`;
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
  const cfg = dev.tkConfig || { side: 'auto', lacs: [], autoBaoDanh: true };
  selSide.value = cfg.side || 'auto';
  chkLac1.checked = cfg.lacs ? cfg.lacs.includes('45') : false;
  chkLac2.checked = cfg.lacs ? cfg.lacs.includes('51') : false;
  chkLac3.checked = cfg.lacs ? cfg.lacs.includes('50') : false;
  
  const chkBaoDanh = document.getElementById('chk-auto-baodanh');
  if (chkBaoDanh) {
    chkBaoDanh.checked = cfg.autoBaoDanh !== false;
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
  
  updateGlobalTK();
  addLog(`[${currentSelectedDeviceId}] Da luu cau hinh Tong Kim.`, 'info');
});

// Save PK Settings
const btnSavePk = document.getElementById('btn-save-pk');
if (btnSavePk) {
  btnSavePk.addEventListener('click', () => {
    if (!currentSelectedDeviceId) {
      addLog('Chua chon nhan vat de luu cau hinh PK.', 'error');
      return;
    }
    const dev = devicesMap.get(currentSelectedDeviceId);
    if (!dev) return;

    dev.tkConfig = dev.tkConfig || { side: 'auto', lacs: [] };

    // Save lacs as they are now relocated to the Attack tab
    const lacs = [];
    if (chkLac1.checked) lacs.push('45');
    if (chkLac2.checked) lacs.push('51');
    if (chkLac3.checked) lacs.push('50');
    dev.tkConfig.lacs = lacs;

    updateGlobalTK();
    addLog(`[${currentSelectedDeviceId}] Da luu cau hinh Tan Cong (PK) & Lac.`, 'success');
  });
}

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
      // Scan without filters (wildcard)
      const res = await window.api.scanDatau(devId, '', { series: -1, level: -1, itemType: -1, gender: 'all', limit });
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

const btnTestCast = document.getElementById('btn-test-cast');
if (btnTestCast) {
  btnTestCast.addEventListener('click', async () => {
    if (!currentSelectedDeviceId) {
      addLog('Chưa chọn nhân vật để test cast skill.', 'error');
      return;
    }
    btnTestCast.disabled = true;
    try {
      await window.api.testCastSkill(currentSelectedDeviceId);
    } catch (e) {
      addLog(`Lỗi test cast: ${e.message}`, 'error');
    }
    btnTestCast.disabled = false;
  });
}

const btnTestBuff = document.getElementById('btn-test-buff');
if (btnTestBuff) {
  btnTestBuff.addEventListener('click', async () => {
    if (!currentSelectedDeviceId) {
      addLog('Chưa chọn nhân vật để test buff.', 'error');
      return;
    }
    btnTestBuff.disabled = true;
    try {
      await window.api.testBuff(currentSelectedDeviceId);
    } catch (e) {
      addLog(`Lỗi test buff: ${e.message}`, 'error');
    }
    btnTestBuff.disabled = false;
  });
}

// --- NPC Test & Interaction buttons ---
const btnGetNpc = document.getElementById('btn-get-npc');
if (btnGetNpc) {
  btnGetNpc.addEventListener('click', async () => {
    const devId = getTestDeviceId();
    if (!devId) return;
    const resContainer = document.getElementById('result-get-npc');
    resContainer.innerText = 'Đang quét NPC xung quanh...';
    try {
      const res = await window.api.testNpcNearNames(devId);
      if (res && res.ok && res.npcMap) {
        let lines = [];
        const entries = Object.entries(res.npcMap);
        lines.push(`Bản đồ hiện tại (Map ID): ${res.mapId || 0}`);
        lines.push(`Tìm thấy ${entries.length} NPC(s):`);
        for (const [id, name] of entries) {
          lines.push(`  ID: ${id} -> Name: ${name}`);
        }
        resContainer.innerText = lines.join('\n');
      } else {
        resContainer.innerText = 'Lỗi quét NPC: ' + JSON.stringify(res);
      }
    } catch(e) {
      resContainer.innerText = 'Lỗi ngoại lệ: ' + e.message;
    }
  });
}

const btnInteractNpc = document.getElementById('btn-interact-npc');
if (btnInteractNpc) {
  btnInteractNpc.addEventListener('click', async () => {
    const devId = getTestDeviceId();
    if (!devId) return;
    const npcId = document.getElementById('txt-interact-npc-id').value.trim();
    if (!npcId) {
      addLog('Vui lòng nhập ID NPC để tương tác.', 'error');
      return;
    }
    const resContainer = document.getElementById('result-interact-npc');
    resContainer.innerText = 'Đang gửi lệnh tương tác...';
    try {
      const res = await window.api.npcInteract(devId, npcId);
      resContainer.innerText = 'Kết quả: ' + JSON.stringify(res);
      if (res && res.ok) {
        addLog(`[${devId}] Đã tương tác với NPC ID ${npcId}.`, 'success');
      } else {
        addLog(`[${devId}] Tương tác NPC thất bại: ${res ? res.error : 'Unknown'}`, 'error');
      }
    } catch(e) {
      resContainer.innerText = 'Lỗi: ' + e.message;
    }
  });
}

const btnSelectDialogOption = document.getElementById('btn-select-dialog-option');
if (btnSelectDialogOption) {
  btnSelectDialogOption.addEventListener('click', async () => {
    const devId = getTestDeviceId();
    if (!devId) return;
    const optionIdxStr = document.getElementById('num-dialog-option').value;
    if (optionIdxStr === '') {
      addLog('Vui lòng nhập chỉ mục option.', 'error');
      return;
    }
    const optionIdx = parseInt(optionIdxStr, 10);
    const resContainer = document.getElementById('result-select-dialog-option');
    resContainer.innerText = `Đang gửi lệnh chọn option ${optionIdx}...`;
    try {
      const res = await window.api.npcSelectOption(devId, optionIdx);
      resContainer.innerText = 'Kết quả: ' + JSON.stringify(res);
      if (res && res.ok) {
        addLog(`[${devId}] Đã gửi gói chọn option ${optionIdx} của dialog.`, 'success');
      } else {
        addLog(`[${devId}] Chọn option thất bại: ${res ? res.error : 'Unknown'}`, 'error');
      }
    } catch(e) {
      resContainer.innerText = 'Lỗi: ' + e.message;
    }
  });
}




