/**
 * Parser for SubRip (`.srt`) and WebVTT (`.vtt`).
 *
 * The two formats share a shape — blocks separated by blank lines, a timing line
 * with `-->`, text underneath — so one tolerant parser handles both. Differences
 * that matter: VTT has a `WEBVTT` header, may carry cue identifiers and settings
 * (`align:start position:10%`), and uses `.` instead of `,` in timestamps.
 */

import { SubtitleError, parseTimestamp } from './timestamp.js';

const TIMING = /^(\S+)\s*-->\s*(\S+)(?:\s+(.*))?$/;

export function detectFormat(text) {
  const head = String(text).replace(/^\uFEFF/, '').trimStart();
  return /^WEBVTT\b/.test(head) ? 'vtt' : 'srt';
}

function normalize(text) {
  return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/**
 * @param {string} text
 * @param {{format?: 'srt'|'vtt', strict?: boolean}} [options]
 * @returns {{format: 'srt'|'vtt', cues: Array<object>, warnings: string[]}}
 */
export function parse(text, options = {}) {
  const { strict = false } = options;
  const source = normalize(text);
  const format = options.format ?? detectFormat(source);

  if (format !== 'srt' && format !== 'vtt') {
    throw new SubtitleError(`不支持的格式：${format}`);
  }

  const blocks = source.split(/\n[ \t]*\n/);
  const cues = [];
  const warnings = [];
  let started = format === 'srt';

  for (const block of blocks) {
    const lines = block.split('\n').filter((line, index, all) => !(index === 0 && line.trim() === ''));
    if (lines.length === 0) continue;

    const first = lines[0].trim();

    // The WEBVTT header block (and any metadata under it) is not a cue.
    if (!started) {
      if (/^WEBVTT\b/.test(first)) {
        started = true;
        continue;
      }
      // Tolerate a missing header instead of dropping the whole file.
      started = true;
    }

    if (format === 'vtt' && /^(NOTE|STYLE|REGION)\b/.test(first)) continue;

    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) {
      const message = `第 ${cues.length + 1} 段缺少时间轴：${first.slice(0, 40)}`;
      if (strict) throw new SubtitleError(message);
      warnings.push(message);
      continue;
    }

    const timing = TIMING.exec(lines[timingIndex].trim());
    if (!timing) {
      const message = `第 ${cues.length + 1} 段时间轴格式不对：${lines[timingIndex].trim()}`;
      if (strict) throw new SubtitleError(message);
      warnings.push(message);
      continue;
    }

    let start;
    let end;
    try {
      start = parseTimestamp(timing[1]);
      end = parseTimestamp(timing[2]);
    } catch (error) {
      const message = `第 ${cues.length + 1} 段：${error.message}`;
      if (strict) throw new SubtitleError(message);
      warnings.push(message);
      continue;
    }

    const idLine = timingIndex > 0 ? lines[timingIndex - 1].trim() : '';
    const settings = timing[3] ? timing[3].trim() : '';
    const textLines = lines.slice(timingIndex + 1);
    const body = textLines.join('\n').trimEnd();

    cues.push({
      index: cues.length + 1,
      id: idLine && !/^\d+$/.test(idLine) ? idLine : '',
      start,
      end,
      settings,
      lines: body ? textLines : [],
      text: body
    });
  }

  if (cues.length === 0) throw new SubtitleError('没有解析到任何字幕');
  return { format, cues, warnings };
}

/** Plain text of a cue, tags stripped — used for statistics and linting. */
export function cueText(cue) {
  return cue.text
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]*\}/g, '')
    .trim();
}
