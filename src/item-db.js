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
let _magicDB = null;

function loadMagic() {
  if (_magicDB) return _magicDB;
  try {
    const fp = path.join(JSON_DIR, 'item_magicattrib.json');
    _magicDB = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    for (const m of _magicDB) {
      const key = m['m_szName'] || '';
      if (key) MAGIC_PROPS[key] = {
        kind: m['nPropKind'] || '', desc: m['m_szIntro'] || '',
        min: m['[0].nMin'] || 0, max: m['[0].nMax'] || 0
      };
    }
  } catch(e) { _magicDB = []; }
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
        const name = (row['﻿0'] || row['0'] || '').trim();
        if (!name) continue;
        const genre = parseInt(row['1']) || 0;
        const detail = parseInt(row['2']) || 0;
        const particular = parseInt(row['3']) || 0;
        const level = parseInt(row['11']) || 0;
        const key = `${genre}|${detail}|${particular}|${level}`;
        _itemDB.push({ key, name, genre, detail, particular, level });
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

function lookupByGdpl(genre, detail, particular, level) {
  return lookup(genre, detail, particular, level);
}

function getGenreName(g) { return GENRE_NAMES[g] || 'Khác'; }
function getSeriesName(s) { return SERIES_NAMES[s] || '?'; }

function getMagicInfo(magicId) {
  loadMagic();
  // Magic ID to name lookup — IDs are indices in the magicattrib table
  if (_magicDB && magicId >= 0 && magicId < _magicDB.length) {
    const m = _magicDB[magicId];
    return {
      name: m['m_szName'] || `Magic#${magicId}`,
      kind: m['nPropKind'] || '',
      desc: m['m_szIntro'] || '',
      level: m['m_nLevel'] || 0
    };
  }
  return { name: `Magic#${magicId}`, kind: '', desc: '', level: 0 };
}

module.exports = { loadItems, lookup, lookupByGdpl, getGenreName, getSeriesName, getMagicInfo, GENRE_NAMES, SERIES_NAMES };
