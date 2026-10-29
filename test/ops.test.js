import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse } from '../src/parse.js';
import { serialize, toSrt, toVtt } from '../src/serialize.js';
import { merge, scale, scaleTo, shift, slice } from '../src/ops.js';
import { SubtitleError } from '../src/timestamp.js';

const cues = [
  { index: 1, start: 1000, end: 3500, text: '第一行\n第二行' },
  { index: 2, start: 4000, end: 6000, text: '第二条' }
];

test('srt output is numbered from one and uses CRLF', () => {
  const out = toSrt(cues);
  assert.ok(out.startsWith('1\r\n00:00:01,000 --> 00:00:03,500\r\n'));
  assert.ok(out.includes('\r\n\r\n2\r\n'));
  assert.ok(out.endsWith('\r\n'));
});

test('vtt output starts with the header and uses dots', () => {
  const out = toVtt(cues);
  assert.ok(out.startsWith('WEBVTT\r\n\r\n'));
  assert.ok(out.includes('00:00:01.000 --> 00:00:03.500'));
});

test('serialize round trips through the parser', () => {
  const again = parse(toSrt(cues)).cues;
  assert.deepEqual(
    again.map((cue) => [cue.start, cue.end, cue.text]),
    cues.map((cue) => [cue.start, cue.end, cue.text])
  );

  const vtt = parse(toVtt(cues)).cues;
  assert.deepEqual(
    vtt.map((cue) => [cue.start, cue.end]),
    cues.map((cue) => [cue.start, cue.end])
  );
});

test('serialize picks the format', () => {
  assert.match(serialize(cues, 'vtt'), /^WEBVTT/);
  assert.match(serialize(cues, 'srt'), /^1\r\n/);
});

test('shift moves every cue', () => {
  const moved = shift(cues, 1500);
  assert.deepEqual(moved.map((cue) => cue.start), [2500, 5500]);
  assert.deepEqual(moved.map((cue) => cue.end), [5000, 7500]);
});

test('shift refuses to go negative by default', () => {
  assert.throws(() => shift(cues, -2000), SubtitleError);
  const clamped = shift(cues, -2000, { allowNegative: true });
  assert.deepEqual(clamped.map((cue) => cue.start), [0, 2000]);
});

test('scale multiplies timings and keeps them ordered', () => {
  const scaled = scale(cues, 25 / 24);
  assert.deepEqual(scaled.map((cue) => cue.start), [1042, 4167]);
  assert.deepEqual(scaled.map((cue) => cue.end), [3646, 6250]);
});

test('scaleTo fits the requested duration', () => {
  const scaled = scaleTo(cues, 12_000);
  assert.equal(Math.max(...scaled.map((cue) => cue.end)), 12_000);
});

test('scale rejects nonsense', () => {
  assert.throws(() => scale(cues, 0), SubtitleError);
  assert.throws(() => scale(cues, Number.NaN), SubtitleError);
});

test('merge sorts by start and renumbers', () => {
  const other = [{ index: 1, start: 2000, end: 3000, text: '插入' }];
  const merged = merge(cues, other);
  assert.deepEqual(merged.map((cue) => cue.start), [1000, 2000, 4000]);
  assert.deepEqual(merged.map((cue) => cue.index), [1, 2, 3]);
});

test('slice keeps overlapping cues and trims them', () => {
  const cut = slice(cues, 2000, 5000);
  assert.deepEqual(cut.map((cue) => [cue.start, cue.end]), [[2000, 3500], [4000, 5000]]);
});

test('transforms do not mutate the input', () => {
  const before = JSON.stringify(cues);
  shift(cues, 1000);
  scale(cues, 2);
  merge(cues);
  assert.equal(JSON.stringify(cues), before);
});
