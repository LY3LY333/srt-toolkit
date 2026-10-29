import { test } from 'node:test';
import assert from 'node:assert/strict';

import { check, displayWidth, readingUnits } from '../src/check.js';
import { SubtitleError } from '../src/timestamp.js';

const cue = (start, end, text, index = 1) => ({ index, start, end, text, lines: text.split('\n') });

const codes = (cues, options) => check(cues, options).issues.map((issue) => issue.code);

test('a clean subtitle has no issues', () => {
  const result = check([cue(0, 2000, '你好'), cue(3000, 5000, '世界')]);
  assert.deepEqual(result.issues, []);
  assert.equal(result.stats.cues, 2);
});

test('detects overlaps as errors', () => {
  const result = check([cue(0, 3000, 'A', 1), cue(2000, 4000, 'B', 2)]);
  assert.equal(result.issues[0].code, 'overlap');
  assert.equal(result.issues[0].severity, 'error');
});

test('detects zero and negative durations', () => {
  assert.ok(codes([cue(1000, 1000, 'A')]).includes('negative-duration'));
});

test('detects cues that are too short or too long', () => {
  assert.ok(codes([cue(0, 200, '短')]).includes('too-short'));
  assert.ok(codes([cue(0, 9000, '很长')]).includes('too-long'));
});

test('detects too many lines', () => {
  assert.ok(codes([cue(0, 3000, '一\n二\n三')]).includes('too-many-lines'));
});

test('detects over-long lines using display width', () => {
  const long = '字'.repeat(30); // 60 columns
  assert.ok(codes([cue(0, 4000, long)]).includes('line-too-long'));
});

test('detects reading speed', () => {
  const fast = '一二三四五六七八九十'; // 10 units in 1 second
  assert.ok(codes([cue(0, 1000, fast)]).includes('reading-speed'));
  assert.ok(!codes([cue(0, 3000, fast)]).includes('reading-speed'));
});

test('detects empty cues', () => {
  assert.ok(codes([cue(0, 2000, '')]).includes('empty'));
});

test('thresholds are configurable', () => {
  const text = '一二三四五六七八九十';
  assert.deepEqual(codes([cue(0, 1500, text)], { maxCps: 20 }), []);
  assert.ok(codes([cue(0, 1500, text)], { maxLineWidth: 5 }).includes('line-too-long'));
});

test('display width counts CJK as two columns', () => {
  assert.equal(displayWidth('ab'), 2);
  assert.equal(displayWidth('中文'), 4);
  assert.equal(displayWidth('a中'), 3);
});

test('reading units count latin as half', () => {
  assert.equal(readingUnits('中文'), 2);
  assert.equal(readingUnits('abcd'), 2);
  assert.equal(readingUnits('中 a'), 1.5);
});

test('stats describe the track', () => {
  const { stats } = check([cue(1000, 3000, 'A'), cue(4000, 9000, 'B')]);
  assert.equal(stats.cues, 2);
  assert.equal(stats.firstStart, 1000);
  assert.equal(stats.lastEnd, 9000);
  assert.equal(stats.totalMs, 7000);
  assert.equal(stats.averageMs, 3500);
  assert.equal(stats.shortestMs, 2000);
  assert.equal(stats.longestMs, 5000);
});

test('rejects empty input', () => {
  assert.throws(() => check([]), SubtitleError);
});
