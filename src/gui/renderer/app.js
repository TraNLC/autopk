// Tab Switching Logic
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(i => i.classList.remove('active'));
    tabPanes.forEach(t => t.classList.remove('active'));

    item.classList.add('active');
    const tabId = item.getAttribute('data-tab');
    document.getElementById(tabId).classList.add('active');
  });
});

// UI Elements
const deviceSelect = document.getElementById('device-select');
const btnScan = document.getElementById('btn-scan');
const btnConnect = document.getElementById('btn-connect');
const btnDisconnect = document.getElementById('btn-disconnect');
const pkGlobalSwitch = document.getElementById('pk-global-switch');
const btnScanShops = document.getElementById('btn-scan-shops');
const btnExportShopsJson = document.getElementById('btn-export-shops-json');
const btnRadarScan = document.getElementById('btn-radar-scan');
const btnCallXaphu = document.getElementById('btn-call-xaphu');
const btnCallLequan = document.getElementById('btn-call-lequan');
const shopListBody = document.getElementById('shop-list-body');

// Modal Elements
const modalShopItems = document.getElementById('modal-shop-items');
const modalShopTitle = document.getElementById('modal-shop-title');
const shopItemsBody = document.getElementById('shop-items-body');
const btnCloseModal = document.getElementById('btn-close-modal');

// Magic Attributes Mapping
const MAGIC_NAMES = {
  26: "Sat thuong vat ly ngoai cong (%)",
  27: "Sat thuong vat ly noi cong (%)",
  28: "Ngu hanh tuong khac (%)",
  29: "Sat thuong vat ly noi cong",
  30: "Sat thuong vat ly noi cong (khoang)",
  31: "Sat thuong vat ly ngoai cong",
  32: "Sat thuong vat ly ngoai cong (khoang)",
  33: "Doc sat noi cong",
  34: "Doc sat ngoai cong",
  35: "Loi sat noi cong",
  36: "Loi sat noi cong (khoang)",
  37: "Loi sat ngoai cong",
  38: "Loi sat ngoai cong (khoang)",
  39: "Bang sat noi cong",
  40: "Bang sat noi cong (khoang)",
  41: "Bang sat ngoai cong",
  42: "Bang sat ngoai cong (khoang)",
  43: "Hoa sat noi cong",
  44: "Hoa sat noi cong (khoang)",
  45: "Hoa sat ngoai cong",
  46: "Hoa sat ngoai cong (khoang)",
  47: "Hoa sat toi da (%)",
  48: "Do chinh xac",
  49: "Do chinh xac (%)",
  50: "Bo qua ne tranh (%)",
  51: "Toc do danh noi cong (%)",
  52: "Toc do danh ngoai cong (%)",
  53: "Ne tranh",
  54: "Ne tranh (%)",
  55: "Toc do di chuyen (%)",
  56: "Phan don can chien",
  57: "Phan don can chien (%)",
  58: "Khang tat ca (%)",
  59: "Hut sinh luc (%)",
  60: "Hut noi luc (%)",
  61: "Sinh luc toi da",
  62: "Sinh luc toi da (%)",
  63: "Noi luc toi da",
  64: "Noi luc toi da (%)",
  65: "The luc toi da",
  66: "The luc toi da (%)",
  67: "Phuc hoi sinh luc",
  68: "Tang phuc hoi sinh luc (%)",
  69: "Phuc hoi noi luc",
  70: "Phuc hoi the luc",
  71: "Suc manh",
  72: "Than phap",
  73: "Sinh khi",
  74: "Noi cong",
  75: "Chuyen hoa sat thuong thanh noi luc (%)",
  76: "Phong thu vat ly (%)",
  77: "Khang doc (%)",
  78: "Khang bang (%)",
  79: "Khang hoa (%)",
  80: "Khang loi (%)",
  81: "Khang tat ca toi da (%)",
  82: "Phong thu vat ly toi da (%)",
  83: "Khang doc toi da (%)",
  84: "Khang bang toi da (%)",
  85: "Khang hoa toi da (%)",
  86: "Khang loi toi da (%)",
  87: "Thoi gian phuc hoi",
  88: "Thoi gian choang (%)",
  89: "Thoi gian trung doc (%)",
  92: "Thoi gian lam cham (%)",
  94: "May man (%)",
  95: "Yeu cau than phap",
  96: "Yeu cau sinh khi",
  97: "Dang cap yeu cau",
  98: "Yeu cau suc manh",
  109: "Do ben",
  114: "Thuoc tinh ngu hanh",
  117: "Khong the pha huy",
  118: "Tan cong chi mang (%)",
  119: "Tang tan cong chi mang (%)",
  121: "Phan don tam xa (%)"
};

let currentMapId = null;

// Stats Elements
const charName = document.getElementById('char-name');
const charSect = document.getElementById('char-sect');
const charLevel = document.getElementById('char-level');
const charMap = document.getElementById('char-map');
const charMoney = document.getElementById('char-money');
const charStorageMoney = document.getElementById('char-storage-money');
const hpText = document.getElementById('hp-text');
const hpProgress = document.getElementById('hp-progress');
const mpText = document.getElementById('mp-text');
const mpProgress = document.getElementById('mp-progress');
const statusGameFd = document.getElementById('status-game-fd');
const statusRecvTotal = document.getElementById('status-recv-total');
const statusSendTotal = document.getElementById('status-send-total');

// Config Elements
const hpPotSlider = document.getElementById('hp-pot-slider');
const hpSliderVal = document.getElementById('hp-slider-val');
const mpPotSlider = document.getElementById('mp-pot-slider');
const mpSliderVal = document.getElementById('mp-slider-val');
const chkSkill1 = document.getElementById('chk-skill-1');
const chkSkill2 = document.getElementById('chk-skill-2');
const chkSkill3 = document.getElementById('chk-skill-3');

// Status Bar
const statusDot = document.getElementById('connection-status-dot');
const statusText = document.getElementById('connection-status-text');

// Sect & Map Mappings
const SECT_NAMES = {
  0: "Thieu Lam",
  1: "Thien Vuong",
  2: "Duong Mon",
  3: "Ngu Doc",
  4: "Nga My",
  5: "Thuy Yen",
  6: "Cai Bang",
  7: "Thien Nhan",
  8: "Vo Dang",
  9: "Con Lon",
  10: "Minh Giao",
  11: "Doan Thi"
};

const MAP_NAMES = {
  37: "Chien Truong Tong Kim (37)",
  1000: "Lam An (1000)",
  1001: "Phuong Tuong (1001)",
  1002: "Bien Kinh (1002)",
  1003: "Tuong Duong (1003)",
  1004: "Duong Chau (1004)",
  1005: "Dai Ly (1005)",
  1006: "Thanh Do (1006)"
};

function getItemCategory(detailAndGenre) {
  const genre = detailAndGenre >> 16;
  const detail = detailAndGenre & 0xFFFF;
  
  if (genre === 0) {
    return "Vu Khi";
  } else if (genre === 1) {
    switch (detail) {
      case 0: return "Non";
      case 1: return "Ao";
      case 2: return "Dai";
      case 3: return "Giay";
      case 4: return "Bao Tay";
      default: return "Giap Khac";
    }
  } else if (genre === 2) {
    switch (detail) {
      case 0: return "Hu Than Phu";
      case 1: return "Nhan";
      case 2: return "Day Chuyen";
      case 3: return "Ngoc Boi";
      default: return "Trang Suc Khac";
    }
  }
  return "Khac";
}

// Scan Devices on load
async function scanDevices() {
  deviceSelect.innerHTML = '<option value="">-- Dang quet thiet bi... --</option>';
  const res = await window.api.scanDevices();
  if (res.ok && res.devices.length > 0) {
    deviceSelect.innerHTML = '';
    res.devices.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.id} (${d.name})`;
      deviceSelect.appendChild(opt);
    });
    btnConnect.disabled = false;
  } else {
    deviceSelect.innerHTML = '<option value="">-- Khong tim thay thiet bi nao --</option>';
    btnConnect.disabled = true;
    appendLog('[He thong] Khong tim thay thiet bi gia lap nao chay qua ADB.');
  }
}

// Connect Device
btnConnect.addEventListener('click', async () => {
  const deviceId = deviceSelect.value;
  if (!deviceId) return;

  btnConnect.disabled = true;
  btnScan.disabled = true;
  deviceSelect.disabled = true;

  appendLog(`[He thong] Dang ket noi toi thiet bi ${deviceId}...`);
  
  const res = await window.api.connectDevice(deviceId);
  if (res.ok) {
    appendLog(`[He thong] Ket noi thanh cong! Da dinh kem vao game (PID: ${res.pid})`);
    
    // Update status bar
    statusDot.className = 'status-indicator connected';
    statusText.textContent = 'Da ket noi';
    
    // UI Toggles
    btnConnect.classList.add('hidden');
    btnDisconnect.classList.remove('hidden');
    pkGlobalSwitch.disabled = false;
    btnScanShops.disabled = false;
    btnExportShopsJson.disabled = false;
    btnRadarScan.disabled = false;
    btnCallXaphu.disabled = false;
    btnCallLequan.disabled = false;
    
    // Send initial settings
    updateSettings();
  } else {
    appendLog(`[Loi] Ket noi that bai: ${res.error}`);
    btnConnect.disabled = false;
    btnScan.disabled = false;
    deviceSelect.disabled = false;
  }
});

// Disconnect Device
btnDisconnect.addEventListener('click', async () => {
  pkGlobalSwitch.checked = false;
  pkGlobalSwitch.disabled = true;
  btnScanShops.disabled = true;
  btnExportShopsJson.disabled = true;
  btnRadarScan.disabled = true;
  btnCallXaphu.disabled = true;
  btnCallLequan.disabled = true;
  currentMapId = null;
  
  await window.api.disconnectDevice();
  
  statusDot.className = 'status-indicator disconnected';
  statusText.textContent = 'Chua ket noi';
  
  btnDisconnect.classList.add('hidden');
  btnConnect.classList.remove('hidden');
  
  btnScan.disabled = false;
  deviceSelect.disabled = false;
  btnConnect.disabled = false;
  
  resetStats();
  appendLog('[He thong] Da ngat ket noi khoi game.');
});

// Auto PK Global Toggle
pkGlobalSwitch.addEventListener('change', async () => {
  const active = pkGlobalSwitch.checked;
  const res = await window.api.toggleAutoPK(active);
  if (!res.ok) {
    appendLog(`[Loi] Khong the chuyen doi Auto PK: ${res.error}`);
    pkGlobalSwitch.checked = !active;
  }
});

// Slider Config updates
hpPotSlider.addEventListener('input', () => {
  hpSliderVal.textContent = `${hpPotSlider.value}%`;
  updateSettings();
});

mpPotSlider.addEventListener('input', () => {
  mpSliderVal.textContent = `${mpPotSlider.value}%`;
  updateSettings();
});

// Checkbox combo updates
[chkSkill1, chkSkill2, chkSkill3].forEach(chk => {
  chk.addEventListener('change', updateSettings);
});

function updateSettings() {
  const skills = [];
  if (chkSkill1.checked) skills.push(1);
  if (chkSkill2.checked) skills.push(2);
  if (chkSkill3.checked) skills.push(3);

  window.api.updateSettings({
    hpThreshold: parseInt(hpPotSlider.value),
    mpThreshold: parseInt(mpPotSlider.value),
    attackSkills: skills
  });
}

// Listeners
window.api.onTabLog(({ type, time, msg }) => {
  appendLog(type, `[${time}] ${msg}`);
});

window.api.onPlayerInfoUpdate((info) => {
  if (info.name) charName.textContent = info.name;
  if (info.sect !== undefined) charSect.textContent = SECT_NAMES[info.sect] || `Chua vao phai (${info.sect})`;
  if (info.level !== undefined) charLevel.textContent = info.level;
  
  if (info.mapId !== undefined) {
    currentMapId = info.mapId;
    charMap.textContent = MAP_NAMES[info.mapId] || `Ban do ID ${info.mapId}`;
  }
  
  if (info.money !== undefined) charMoney.textContent = formatSilver(info.money);
  if (info.storageMoney !== undefined) charStorageMoney.textContent = formatSilver(info.storageMoney);
  
  // HP update
  if (info.hp !== undefined && info.maxHp !== undefined) {
    hpText.textContent = `${info.hp} / ${info.maxHp}`;
    const pct = Math.min(100, Math.max(0, (info.hp / info.maxHp) * 100));
    hpProgress.style.width = `${pct}%`;
  }
  
  // MP update
  if (info.mp !== undefined && info.maxMp !== undefined) {
    mpText.textContent = `${info.mp} / ${info.maxMp}`;
    const pct = Math.min(100, Math.max(0, (info.mp / info.maxMp) * 100));
    mpProgress.style.width = `${pct}%`;
  }

  // Network stats
  if (info.gameFd !== undefined) statusGameFd.textContent = info.gameFd || 'Null';
  if (info.recvTotal !== undefined) statusRecvTotal.textContent = info.recvTotal;
  if (info.sendTotal !== undefined) statusSendTotal.textContent = info.sendTotal;
});

// Helper functions
function appendLog(type, msg) {
  const consoleId = `log-${type === 'system' ? 'settings' : type === 'nhan_vat' ? 'character' : type === 'pk' ? 'combat' : type}`;
  const targetConsole = document.getElementById(consoleId);
  if (targetConsole) {
    const p = document.createElement('div');
    p.textContent = msg;
    targetConsole.appendChild(p);
    targetConsole.scrollTop = targetConsole.scrollHeight;
  }
  
  if (type === 'shop') {
    const modalConsole = document.getElementById('log-shops-modal');
    if (modalConsole) {
      const p = document.createElement('div');
      p.textContent = msg;
      modalConsole.appendChild(p);
      modalConsole.scrollTop = modalConsole.scrollHeight;
    }
  }
}

// Clear buttons handlers
document.querySelectorAll('.btn-clear-local-log').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');
    const targetConsole = document.getElementById(targetId);
    if (targetConsole) {
      targetConsole.textContent = '';
    }
  });
});

function formatSilver(val) {
  if (val === undefined || val === null) return '0 luong';
  const num = parseInt(val);
  if (isNaN(num)) return '0 luong';
  if (num < 10000) {
    return `${num} luong`;
  }
  const van = Math.floor(num / 10000);
  const luong = num % 10000;
  if (luong === 0) {
    return `${van} van`;
  }
  return `${van} van ${luong} luong`;
}

function resetStats() {
  charName.textContent = 'Chua ket noi';
  charSect.textContent = 'None';
  charLevel.textContent = '0';
  charMap.textContent = 'None';
  charMoney.textContent = '0';
  charStorageMoney.textContent = '0';
  hpText.textContent = '1000 / 1000';
  hpProgress.style.width = '100%';
  mpText.textContent = '1000 / 1000';
  mpProgress.style.width = '100%';
  statusGameFd.textContent = 'Null';
  statusRecvTotal.textContent = '0';
  statusSendTotal.textContent = '0';
  
  shopListBody.innerHTML = `
    <tr style="border-bottom: 1px solid hsl(220, 10%, 18%);">
      <td colspan="5" style="padding: 20px; text-align: center;" class="text-muted">Vui long ket noi thiet bi va bam nut QUET CUA HANG.</td>
    </tr>`;
}

btnScan.addEventListener('click', scanDevices);

// Run scan on boot
scanDevices();
resetStats();

// Scan Nearby Shops Click Event
btnScanShops.addEventListener('click', async () => {
  btnScanShops.disabled = true;
  btnScanShops.textContent = 'DANG QUET...';
  appendLog('shop', '[He thong] Dang quet sap hang cua nguoi choi xung quanh...');
  
  try {
    const res = await window.api.scanNearbyShops();
    if (res.ok && res.shops && res.shops.length > 0) {
      appendLog('shop', `[He thong] Tim thay ${res.shops.length} sap hang nguoi choi.`);
      shopListBody.innerHTML = '';
      res.shops.forEach(shop => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid hsl(220, 10%, 18%)';
        
        tr.innerHTML = `
          <td style="padding: 10px;" class="highlight-text">${shop.name}</td>
          <td style="padding: 10px; font-family: monospace; color: hsl(210, 10%, 75%);">${shop.cid}</td>
          <td style="padding: 10px; text-align: center;">${shop.level}</td>
          <td style="padding: 10px; text-align: center;"><span style="background-color: hsla(145, 63%, 49%, 0.15); color: hsl(145, 63%, 49%); padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Dang ban</span></td>
          <td style="padding: 10px; text-align: center;"><button class="btn-xem-hang" data-cid="${shop.cid}">Xem Hang</button></td>
        `;
        shopListBody.appendChild(tr);
      });
    } else {
      appendLog('shop', '[He thong] Khong tim thay sap hang nguoi choi nao xung quanh.');
      shopListBody.innerHTML = `
        <tr style="border-bottom: 1px solid hsl(220, 10%, 18%);">
          <td colspan="5" style="padding: 20px; text-align: center;" class="text-muted">Khong tim thay sap hang nao xung quanh.</td>
        </tr>`;
    }
  } catch (err) {
    appendLog('shop', `[Loi] Khong the quet sap hang: ${err.message}`);
  } finally {
    btnScanShops.disabled = false;
    btnScanShops.textContent = 'QUET CUA HANG';
  }
});

// Modal Close Events
btnCloseModal.addEventListener('click', () => {
  modalShopItems.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === modalShopItems) {
    modalShopItems.style.display = 'none';
  }
});

// Handle Xem Hang (View Items) Click Event
shopListBody.addEventListener('click', async (e) => {
  if (e.target && e.target.classList.contains('btn-xem-hang')) {
    const cid = e.target.getAttribute('data-cid');
    const parts = cid.split('.');
    const stallIndex = parts[1];
    
    // Open Modal and show loading status
    modalShopItems.style.display = 'flex';
    modalShopTitle.textContent = `Dang tai sap: ${cid}...`;
    shopItemsBody.innerHTML = `
      <tr>
        <td colspan="5" style="padding: 20px; text-align: center;" class="text-muted">Dang truy van vat pham tu may chu... (Vui long doi)</td>
      </tr>`;
      
    try {
      const res = await window.api.scanShopItems(stallIndex);
      if (res.ok) {
        modalShopTitle.textContent = res.title || `Sap hang: ${cid}`;
        if (res.items && res.items.length > 0) {
          shopItemsBody.innerHTML = '';
          res.items.forEach(item => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid hsl(220, 10%, 18%)';
            
            // Format Price
            let priceText = 'Mien phi';
            if (item.money > 0) {
              priceText = `${item.money.toLocaleString()} bac`;
            } else if (item.knb > 0) {
              priceText = `${item.knb.toLocaleString()} KNB`;
            }
            
            // Decode Element Series
            const SERIES_NAMES = {
              1: "Kim",
              2: "Moc",
              3: "Thuy",
              4: "Hoa",
              5: "Tho"
            };
            const seriesVal = item.stackAndSeries & 0x7;
            const seriesText = SERIES_NAMES[seriesVal] || 'Khong';
            
            // Parse Option/Magic values
            let optionsText = '';
            if (item.magics && item.magics.length > 0) {
              const opts = [];
              for (let i = 0; i < item.magics.length; i += 2) {
                const attrId = item.magics[i];
                const attrVal = item.magics[i + 1];
                if (attrId > 0) {
                  const attrName = MAGIC_NAMES[attrId] || `Ma thuoc tinh ${attrId}`;
                  opts.push(`<div style="margin: 2px 0;"><span style="color: hsl(210, 10%, 65%);">${attrName}:</span> <span style="color: hsl(43, 64%, 53%); font-weight: 600;">+${attrVal}</span></div>`);
                }
              }
              optionsText = opts.length > 0 ? opts.join('') : '<span class="text-muted">Khong co thuoc tinh</span>';
            } else {
              optionsText = '<span class="text-muted">Khong co thuoc tinh</span>';
            }
            
            // Get category
            const categoryText = getItemCategory(item.detailAndGenre);
            
            tr.innerHTML = `
              <td style="padding: 10px;" class="highlight-text">${item.name}</td>
              <td style="padding: 10px; text-align: center; color: hsl(210, 10%, 75%);">${categoryText}</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: hsl(145, 63%, 49%);">${priceText}</td>
              <td style="padding: 10px; text-align: center; color: hsl(204, 70%, 53%);">${seriesText}</td>
              <td style="padding: 10px;">${optionsText}</td>
            `;
            shopItemsBody.appendChild(tr);
          });
        } else {
          shopItemsBody.innerHTML = `
            <tr>
              <td colspan="5" style="padding: 20px; text-align: center;" class="text-muted">Sap hang nay khong bay ban vat pham nao.</td>
            </tr>`;
        }
      } else {
        shopItemsBody.innerHTML = `
          <tr>
            <td colspan="5" style="padding: 20px; text-align: center; color: hsl(5, 78%, 57%);" class="text-muted">Loi tai du lieu sap hang: ${res.error}</td>
          </tr>`;
      }
    } catch (err) {
      shopItemsBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 20px; text-align: center; color: hsl(5, 78%, 57%);" class="text-muted">Loi he thong: ${err.message}</td>
        </tr>`;
    }}
});

btnExportShopsJson.addEventListener('click', async () => {
  btnExportShopsJson.disabled = true;
  btnExportShopsJson.textContent = 'DANG XUAT...';
  appendLog('shop', '[He thong] Bat dau quet va xuat hang loat tat ca cac sap hang...');
  
  try {
    const res = await window.api.exportAllShopsJson();
    if (res.ok) {
      appendLog('shop', `[He thong] Da quet thanh cong ${res.scannedShops} sap hang. File JSON luu tai: ${res.filePath}`);
    } else {
      appendLog('shop', `[Loi] Quet hang loat that bai: ${res.error}`);
    }
  } catch (err) {
    appendLog('shop', `[Loi] Loi he thong quet hang loat: ${err.message}`);
  } finally {
    btnExportShopsJson.disabled = false;
    btnExportShopsJson.textContent = 'XUAT JSON HANG LOAT';
  }
});

// Radar Scan click handler
btnRadarScan.addEventListener('click', async () => {
  btnRadarScan.disabled = true;
  btnRadarScan.textContent = '📡 DANG QUET...';
  appendLog('shop', '[Radar] Bat dau quet toan bo sap hang xung quanh...');
  
  try {
    const res = await window.api.radarScanShops();
    if (res.ok) {
      appendLog('shop', `[Radar] ✅ Quet xong! ${res.scannedShops} shop thanh cong, ${res.failedShops} that bai, ${res.totalItems} items.`);
      appendLog('shop', `[Radar] JSON: ${res.filePath}`);
      appendLog('shop', `[Radar] 👉 Mo file shop-viewer.html de xem ket qua!`);
    } else {
      appendLog('shop', `[Radar] Loi: ${res.error}`);
    }
  } catch (err) {
    appendLog('shop', `[Radar] Loi he thong: ${err.message}`);
  } finally {
    btnRadarScan.disabled = false;
    btnRadarScan.textContent = '📡 RADAR QUET';
  }
});

// Remote NPC Dialogue click handlers
btnCallXaphu.addEventListener('click', async () => {
  if (!currentMapId) {
    appendLog('nhan_vat', '[Warning] Chua nhan duoc thong tin ban do tu game de lay ID Xa Phu.');
    return;
  }
  
  const XAPHU_NPCS = {
    1: "879",
    11: "1058",
    37: "1386",
    78: "1222",
    80: "1312",
    162: "4159",
    176: "3363"
  };
  
  const npcId = XAPHU_NPCS[currentMapId];
  if (!npcId) {
    appendLog('nhan_vat', `[Warning] Khong tim thay Xa Phu cho ban do ID ${currentMapId}.`);
    return;
  }
  
  btnCallXaphu.disabled = true;
  const res = await window.api.remoteNpcDialogue(npcId);
  btnCallXaphu.disabled = false;
  
  if (res.ok) {
    appendLog('nhan_vat', `[He thong] Da gui tin hieu goi Xa Phu tu xa (NPC ID: ${npcId}). Hay kiem tra hop thoai trong game!`);
  } else {
    appendLog('nhan_vat', `[Loi] Khong the goi Xa Phu: ${res.error}`);
  }
});

btnCallLequan.addEventListener('click', async () => {
  if (!currentMapId) {
    appendLog('nhan_vat', '[Warning] Chua nhan duoc thong tin ban do tu game de lay ID Le Quan.');
    return;
  }
  
  const LEQUAN_NPCS = {
    37: "1727",
    78: "1375",
    80: "1243",
    162: "4095",
    176: "3445"
  };
  
  const npcId = LEQUAN_NPCS[currentMapId];
  if (!npcId) {
    appendLog('nhan_vat', `[Warning] Khong tim thay Le Quan cho ban do ID ${currentMapId}.`);
    return;
  }
  
  btnCallLequan.disabled = true;
  const res = await window.api.remoteNpcDialogue(npcId);
  btnCallLequan.disabled = false;
  
  if (res.ok) {
    appendLog('nhan_vat', `[He thong] Da gui tin hieu goi Le Quan tu xa (NPC ID: ${npcId}). Hay kiem tra hop thoai trong game!`);
  } else {
    appendLog('nhan_vat', `[Loi] Khong the goi Le Quan: ${res.error}`);
  }
});
