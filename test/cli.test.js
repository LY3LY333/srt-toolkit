import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { run } from '../src/cli.js';

const SRT = [
  '1',
  '00:00:01,000 --> 00:00:03,000',
  '第一行',
  '',
  '2',
  '00:00:04,000 --> 00:00:06,000',
  '第二行',
  ''
].join('\r\n');

function workspace(files) {
  const dir = mkdtempSync(join(tmpdir(), 'srt-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf8');
  }
  const out = [];
  const err = [];
  const io = { out: (text) => out.push(text), err: (text) => err.push(text) };
  const invoke = (argv) => run(argv.map((arg) => arg.replace('{dir}', dir)), { io });
  return { dir, out, err, invoke, read: (name) => readFileSync(join(dir, name), 'utf8') };
}

test('info prints a summary', () => {
  const w = workspace({ 'a.srt': SRT });
  assert.equal(w.invoke(['info', '{dir}/a.srt']), 0);
  const text = w.out.join('\n');
  assert.match(text, /a\.srt/);
  assert.match(text, /SRT/);
  assert.match(text, /2 条/);
});

test('shift writes to stdout by default', () => {
  const w = workspace({ 'a.srt': SRT });
  assert.equal(w.invoke(['shift', '{dir}/a.srt', '--by', '+1s']), 0);
  const text = w.out.join('\n');
  assert.match(text, /00:00:02,000 --> 00:00:04,000/);
  assert.match(text, /00:00:05,000 --> 00:00:07,000/);
});

test('shift --out writes a file', () => {
  const w = workspace({ 'a.srt': SRT });
  assert.equal(w.invoke(['shift', '{dir}/a.srt', '--by', '+1s', '--out', '{dir}/b.srt']), 0);
  assert.match(w.read('b.srt'), /00:00:02,000/);
});

test('convert produces webvtt', () => {
  const w = workspace({ 'a.srt': SRT });
  assert.equal(w.invoke(['convert', '{dir}/a.srt', '--to', 'vtt']), 0);
  assert.match(w.out.join('\n'), /^WEBVTT/);
  assert.match(w.out.join('\n'), /00:00:01\.000 --> 00:00:03\.000/);
});

test('scale with factor', () => {
  const w = workspace({ 'a.srt': SRT });
  assert.equal(w.invoke(['scale', '{dir}/a.srt', '--factor', '2']), 0);
  assert.match(w.out.join('\n'), /00:00:02,000 --> 00:00:06,000/);
});

test('merge combines two tracks', () => {
  const second = ['1', '00:00:02,000 --> 00:00:03,000', '插进来的'].join('\r\n');
  const w = workspace({ 'a.srt': SRT, 'c.srt': second });
  assert.equal(w.invoke(['merge', '{dir}/a.srt', '{dir}/c.srt', '--out', '{dir}/m.srt']), 0);
  const merged = w.read('m.srt');
  assert.match(merged, /插进来的/);
  assert.match(merged, /^1\r\n00:00:01,000/);
});

test('check exits 1 on problems and 0 when clean', () => {
  const bad = ['1', '00:00:01,000 --> 00:00:01,200', '一二三四五六七八九十'].join('\r\n');
  const w = workspace({ 'bad.srt': bad, 'good.srt': SRT });

  assert.equal(w.invoke(['check', '{dir}/bad.srt']), 1);
  assert.match(w.out.join('\n'), /reading-speed|too-short/);

  w.out.length = 0;
  assert.equal(w.invoke(['check', '{dir}/good.srt']), 0);
  assert.match(w.out.join('\n'), /没有问题/);
});

test('check --json is machine readable', () => {
  const bad = ['1', '00:00:01,000 --> 00:00:01,200', '短'].join('\r\n');
  const w = workspace({ 'bad.srt': bad });
  assert.equal(w.invoke(['check', '{dir}/bad.srt', '--json']), 1);
  const payload = JSON.parse(w.out.join('\n'));
  assert.equal(payload.issues > 0, true);
  assert.equal(payload.files[0].file, 'bad.srt');
});

test('slice extracts a window', () => {
  const w = workspace({ 'a.srt': SRT });
  assert.equal(w.invoke(['slice', '{dir}/a.srt', '--from', '00:00:03', '--to', '00:00:05']), 0);
  const text = w.out.join('\n');
  assert.match(text, /第二行/);
  assert.doesNotMatch(text, /第一行/);
});

test('usage errors exit with 2', () => {
  const w = workspace({ 'a.srt': SRT });
  assert.equal(w.invoke(['bogus', '{dir}/a.srt']), 2);
  assert.equal(w.invoke(['shift', '{dir}/a.srt']), 2);
  assert.equal(w.invoke(['convert', '{dir}/a.srt', '--to', 'txt']), 2);
  assert.equal(w.invoke(['info', '{dir}/missing.srt']), 2);
});

test('help is available without files', () => {
  const w = workspace({});
  assert.equal(w.invoke(['help']), 0);
  assert.match(w.out.join('\n'), /srt — 字幕工具箱/);
});
