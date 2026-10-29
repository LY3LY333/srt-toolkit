import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cueText, detectFormat, parse } from '../src/parse.js';
import { SubtitleError } from '../src/timestamp.js';

const SRT = [
  '1',
  '00:00:01,000 --> 00:00:03,500',
  '第一行字幕',
  '第二行字幕',
  '',
  '2',
  '00:00:04,000 --> 00:00:06,000',
  '第二条'
].join('\r\n');

test('parses a basic srt', () => {
  const { format, cues } = parse(SRT);
  assert.equal(format, 'srt');
  assert.equal(cues.length, 2);
  assert.deepEqual(cues[0].start, 1000);
  assert.deepEqual(cues[0].end, 3500);
  assert.equal(cues[0].text, '第一行字幕\n第二行字幕');
  assert.equal(cues[1].text, '第二条');
});

test('tolerates a BOM and missing cue numbers', () => {
  const text = '\uFEFF00:00:01,000 --> 00:00:02,000\n你好\n';
  const { cues } = parse(text);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, '你好');
});

test('detects webvtt', () => {
  assert.equal(detectFormat('WEBVTT\n\n00:00.000 --> 00:01.000\nhi'), 'vtt');
  assert.equal(detectFormat(SRT), 'srt');
});

test('parses vtt with header, note, id and settings', () => {
  const text = [
    'WEBVTT',
    'Kind: captions',
    '',
    'NOTE 这是一条注释，不是字幕',
    '',
    'intro',
    '00:00:01.000 --> 00:00:03.000 align:start position:10%',
    '你好，世界',
    '',
    '00:00:04.000 --> 00:00:05.000',
    '第二条'
  ].join('\n');

  const { format, cues } = parse(text);
  assert.equal(format, 'vtt');
  assert.equal(cues.length, 2);
  assert.equal(cues[0].id, 'intro');
  assert.equal(cues[0].settings, 'align:start position:10%');
  assert.equal(cues[0].start, 1000);
});

test('skips blocks without a timing line but records a warning', () => {
  const text = ['1', '00:00:01,000 --> 00:00:02,000', '好', '', '这段没有时间轴'].join('\n');
  const { cues, warnings } = parse(text);
  assert.equal(cues.length, 1);
  assert.equal(warnings.length, 1);
});

test('strict mode throws instead of warning', () => {
  const text = ['1', '00:00:01,000 --> 00:00:02,000', '好', '', '这段没有时间轴'].join('\n');
  assert.throws(() => parse(text, { strict: true }), SubtitleError);
});

test('throws when nothing can be parsed', () => {
  assert.throws(() => parse('hello world'), SubtitleError);
});

test('cueText strips tags and styling', () => {
  const cues = parse(['1', '00:00:01,000 --> 00:00:02,000', '<i>斜体</i> {\an8}文字'].join('\n')).cues;
  assert.equal(cueText(cues[0]), '斜体 文字');
});

test('keeps multi-line text intact', () => {
  const text = ['1', '00:00:01,000 --> 00:00:02,000', 'A', 'B', 'C', '', '2', '00:00:03,000 --> 00:00:04,000', 'D'].join('\n');
  const { cues } = parse(text);
  assert.equal(cues[0].text, 'A\nB\nC');
  assert.equal(cues[0].lines.length, 3);
});
