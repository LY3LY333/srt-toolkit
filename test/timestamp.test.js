import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SubtitleError,
  formatTimestamp,
  parseDuration,
  parseTimestamp
} from '../src/timestamp.js';

test('parses full timestamps with comma or dot', () => {
  assert.equal(parseTimestamp('01:02:03,456'), 3_723_456);
  assert.equal(parseTimestamp('1:02:03.456'), 3_723_456);
  assert.equal(parseTimestamp('00:00:00,000'), 0);
});

test('parses short timestamps without hours', () => {
  assert.equal(parseTimestamp('02:03,456'), 123_456);
  assert.equal(parseTimestamp('02:03'), 123_000);
  assert.equal(parseTimestamp('00:01:00'), 60_000);
});

test('pads short fractions', () => {
  assert.equal(parseTimestamp('00:00:00,4'), 400);
  assert.equal(parseTimestamp('00:00:00,45'), 450);
  assert.equal(parseTimestamp('00:00:00,456'), 456);
});

test('rejects nonsense', () => {
  assert.throws(() => parseTimestamp('abc'), SubtitleError);
  assert.throws(() => parseTimestamp('00:99:00,000'), SubtitleError);
  assert.throws(() => parseTimestamp(''), SubtitleError);
});

test('formats with comma for srt and dot for vtt', () => {
  assert.equal(formatTimestamp(3_723_456), '01:02:03,456');
  assert.equal(formatTimestamp(3_723_456, { separator: '.' }), '01:02:03.456');
  assert.equal(formatTimestamp(0), '00:00:00,000');
});

test('can drop the hours field', () => {
  assert.equal(formatTimestamp(123_456, { forceHours: false }), '02:03,456');
  assert.equal(formatTimestamp(3_723_456, { forceHours: false }), '01:02:03,456');
});

test('round trips', () => {
  for (const ms of [0, 1, 999, 61_000, 3_599_999, 7_380_000]) {
    assert.equal(parseTimestamp(formatTimestamp(ms)), ms);
  }
});

test('formats reject negative input', () => {
  assert.throws(() => formatTimestamp(-1), SubtitleError);
});

test('parseDuration understands units and clock forms', () => {
  assert.equal(parseDuration('+1.5s'), 1500);
  assert.equal(parseDuration('-750ms'), -750);
  assert.equal(parseDuration('90'), 90_000);
  assert.equal(parseDuration('2m'), 120_000);
  assert.equal(parseDuration('1h'), 3_600_000);
  assert.equal(parseDuration('1:02'), 62_000);
  assert.equal(parseDuration('00:00:02,500'), 2500);
  assert.equal(parseDuration('+00:01:00'), 60_000);
});

test('parseDuration rejects garbage', () => {
  assert.throws(() => parseDuration('abc'), SubtitleError);
  assert.throws(() => parseDuration(''), SubtitleError);
});
