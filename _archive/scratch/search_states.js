const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'output', 'json', 'states.json');
if (!fs.existsSync(filePath)) {
  console.log("states.json does not exist");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
const keywords = ['protect', 'relive', 'shield', 'safe', 'bubble', 'born', 'others', 'dun', 'yuy', 'hu', 'sheng', 'fuhuo', 'fu_huo'];

const results = [];
for (const entry of data) {
  const spr = (entry.spr || '').toLowerCase();
  const desc = (entry.description || '').toLowerCase();
  
  const matches = keywords.filter(kw => spr.includes(kw) || desc.includes(kw));
  if (matches.length > 0) {
    results.push({
      id: entry['﻿id'] || entry.id,
      description: entry.description,
      spr: entry.spr,
      matches
    });
  }
}

console.log(JSON.stringify(results, null, 2));
