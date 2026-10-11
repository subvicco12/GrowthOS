#!/usr/bin/env node
// Offline, dependency-free parser regression check. Never connects to a database.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = path.resolve(__dirname, '../database/mysql');
const expected = [7,1,1,1,2,1,1,2];
for (let i=1;i<=8;i++) {
  const prefix=String(i).padStart(3,'0')+'_';
  const matches=fs.readdirSync(dir).filter(f=>f.startsWith(prefix)&&f.endsWith('.sql'));
  assert.equal(matches.length,1,'exactly one migration '+prefix);
  const sql=fs.readFileSync(path.join(dir,matches[0]),'utf8');
  const statements=i===8
    ? sql.split('\n').filter(line=>/^CREATE TRIGGER /i.test(line.trim())).map(line=>line.trim().replace(/\/\/$/,''))
    : sql.split('\n').filter(line=>!/^\s*--/.test(line)).join('\n').split(';').map(s=>s.trim()).filter(Boolean);
  assert.equal(statements.length,expected[i-1],matches[0]+' statement count');
  for (const statement of statements) {
    assert.match(statement,i===8?/^CREATE TRIGGER\b/i:/^(CREATE TABLE|INSERT INTO)\b/i);
  }
  console.log('PASS',matches[0],statements.length,'statements');
}
console.log('PASS: 16 statements extracted across 8 migrations (offline only)');
