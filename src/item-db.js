// src/item-db.js — Game item database loaded from data/output/json/item_*.json
const fs = require('fs');
const path = require('path');

const JSON_DIR = path.join(__dirname, '..', 'data', 'output', 'json');

// Genre names + detail names
const GENRE_NAMES = { 0: 'Vũ Khí', 1: 'Ám Khí', 2: 'Áo', 3: 'Nhẫn', 4: 'Dây Chuyền', 5: 'Giày', 6: 'Thắt Lưng', 7: 'Mũ', 8: 'Bao Tay', 9: 'Ngọc Bội' };
const SERIES_NAMES = { 0: 'Kim', 1: 'Mộc', 2: 'Thủy', 3: 'Hỏa', 4: 'Thổ' };

// Magic attribute descriptions from magicattrib.json
const MAGIC_PROPS = {};

let _itemDB = null;
let _magicIdMap = null;
let _magicDB = null;

function loadMagic() {
  if (_magicDB) return _magicDB;
  try {
    _magicIdMap = JSON.parse(fs.readFileSync(path.join(JSON_DIR, '..', 'magic_id_map.json'), 'utf-8'));
    
    const descData = JSON.parse(fs.readFileSync(path.join(JSON_DIR, 'magicdesc.json'), 'utf-8'));
    _magicDB = {};
    for (const m of descData) {
      const type = m['\uFEFFMAGIC.TYPE'] || m['MAGIC.TYPE'];
      if (type) {
        let desc = m['DESCRIPTION'] || '';
        // Clean up format like "{+.value.1} điểm" to "{value}"
        desc = desc.replace(/\{\+?\.value\.\d+\}/g, '{value}');
        _magicDB[type] = {
          name: type,
          desc: desc
        };
      }
    }
  } catch(e) { 
    _magicDB = {}; 
    _magicIdMap = {};
  }
  return _magicDB;
}

function loadItems() {
  if (_itemDB) return _itemDB;
  _itemDB = [];
  const files = fs.readdirSync(JSON_DIR).filter(f => f.startsWith('item_') && f.endsWith('.json'));
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(JSON_DIR, f), 'utf-8'));
      for (const row of data) {
        const name = (row['﻿name'] || row['name'] || row['﻿0'] || row['0'] || '').trim();
        if (!name) continue;
        
        // Support both numeric columns (standard text files) and named columns (some JSON dumps like goldequip, magicscript)
        let genre = row['genre'] !== undefined ? parseInt(row['genre']) : parseInt(row['1']);
        let detail = row['detail'] !== undefined ? parseInt(row['detail']) : parseInt(row['2']);
        let particular = row['particular'] !== undefined ? parseInt(row['particular']) : parseInt(row['3']);
        let level = row['level'] !== undefined ? parseInt(row['level']) : parseInt(row['11']);

        // For files like item_magicscript.json where genre is not present at all
        if (isNaN(genre)) {
          genre = 10006; // Magic script item genre
          detail = 0;
          if (isNaN(level) || level === 0) level = 1;
        }
        
        if (isNaN(genre)) genre = 0;
        if (isNaN(detail)) detail = 0;
        if (isNaN(particular)) particular = 0;
        if (isNaN(level)) level = 0;
        
        // Also map genre 10000+ down to normal genre for standard lookups
        if (genre > 10000 && row['particular'] === undefined) {
           genre = genre % 10000;
        }

        const reqLevel = parseInt(row['35']) || 0;
        let gender = -1;
        if (row['giới_tính'] !== undefined && !isNaN(parseInt(row['giới_tính']))) {
          gender = parseInt(row['giới_tính']);
        } else if (gender === -1 && row['43'] !== undefined && !isNaN(parseInt(row['43']))) {
          gender = parseInt(row['43']);
        } else if (gender === -1 && row['đẳng_cấp_yêu_cầu'] === 'giới_tính') {
          const parsed = parseInt(row['37']);
          if (!isNaN(parsed)) gender = parsed;
        }
        let reqStr = parseInt(row['37']) || parseInt(row['yêu_cầu_sức_mạnh']) || 0;
        let reqDex = parseInt(row['39']) || parseInt(row['yêu_cầu_thân_pháp']) || 0;
        
        // Handle malformed JSON headers pushing stats around
        if (isNaN(reqStr) && row['đẳng_cấp_yêu_cầu'] !== undefined) {
           const parsed = parseInt(row['đẳng_cấp_yêu_cầu']);
           if (!isNaN(parsed) && parsed > 0 && parsed < 1000) reqStr = parsed; // rough heuristic if shifted
        }
        
        const key = `${genre}|${detail}|${particular}|${level}`;
        _itemDB.push({ key, name, genre, detail, particular, level, reqLevel, reqStr, reqDex, gender });
      }
    } catch(e) {}
  }
  console.log(`[ItemDB] Loaded ${_itemDB.length} items from ${files.length} files`);
  return _itemDB;
}

function lookup(genre, detail, particular, level) {
  loadItems();
  const key = `${genre}|${detail}|${particular}|${level}`;
  const found = _itemDB.filter(it => it.key === key);
  return found.length > 0 ? found[0].name : null;
}

function lookupInfo(genre, detail, particular, level) {
  loadItems();
  if ((genre === 10006 || genre === 6) && particular === 0 && level > 0) {
    particular = level;
    level = 1;
  }
  const key = `${genre}|${detail}|${particular}|${level}`;
  const found = _itemDB.filter(it => it.key === key);
  return found.length > 0 ? found[0] : null;
}

function lookupByGdpl(genre, detail, particular, level) {
  return lookup(genre, detail, particular, level);
}

function getGenreName(g) { return GENRE_NAMES[g] || 'Khác'; }
function getSeriesName(s) { return SERIES_NAMES[s] || '?'; }

function getMagicInfo(magicId) {
  loadMagic();
  const type = _magicIdMap && _magicIdMap[String(magicId)];
  if (type && _magicDB && _magicDB[type]) {
    return _magicDB[type];
  }
  return { name: `Magic#${magicId}`, desc: '', kind: '' };
}

let _mapList = null;
function loadMapList() {
  if (_mapList) return _mapList;
  _mapList = {};
  try {
    const txt = fs.readFileSync(path.join(JSON_DIR, '..', '..', 'game_raw', 'settings', 'maplist.ini'), 'utf-8');
    const lines = txt.split('\n');
    lines.forEach(l => {
      const parts = l.split('=');
      if (parts.length === 2 && parts[0].endsWith('_name')) {
        _mapList[parts[0].replace('_name', '')] = parts[1].trim();
      }
    });
  } catch (e) {}
  return _mapList;
}

function getMapName(mapId) {
  loadMapList();
  return _mapList[String(mapId)] || `Bản đồ (${mapId})`;
}

module.exports = { _itemDB,  loadItems, lookup, lookupByGdpl, getGenreName, getSeriesName, getMagicInfo, getMapName, GENRE_NAMES, SERIES_NAMES, lookupByGdplInfo: lookupInfo };
