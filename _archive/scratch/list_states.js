const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'output', 'json', 'states.json');
if (!fs.existsSync(filePath)) {
  console.log("states.json does not exist");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
const list = data.slice(2, 60).map(entry => ({
  id: entry['﻿id'] || entry.id,
  description: entry.description || '',
  spr: entry.spr || ''
}));

console.log(JSON.stringify(list, null, 2));
