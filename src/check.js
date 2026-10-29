/**
 * Subtitle linting.
 *
 * Reading speed uses "reading units" so one threshold works for Chinese and
 * English: one CJK character counts as one unit, two Latin characters count as
 * one unit — roughly how much a viewer can take in per second.
 */

import { cueText } from './parse.js';
import { SubtitleError } from './timestamp.js';

export const DEFAULTS = {
  maxLineWidth: 42,
  maxLines: 2,
  minCueMs: 400,
  maxCueMs: 7000,
  maxCps: 9
};

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;

export function displayWidth(text) {
  let width = 0;
  for (const char of String(text)) width += CJK.test(char) ? 2 : 1;
  return width;
}

export function readingUnits(text) {
  let units = 0;
  for (const char of String(text)) {
    if (/\s/.test(char)) continue;
    units += CJK.test(char) ? 1 : 0.5;
  }
  return units;
}

function severityOf(code) {
  return code === 'overlap' || code === 'negative-duration' ? 'error' : 'warn';
}

/**
 * @param {Array<object>} cues
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {{issues: Array<object>, stats: object}}
 */
export function check(cues, options = {}) {
  if (!Array.isArray(cues) || cues.length === 0) throw new SubtitleError('没有可检查的字幕');
  const settings = { ...DEFAULTS, ...options };
  const issues = [];

  const push = (cue, code, message) => {
    issues.push({ cue: cue.index, code, severity: severityOf(code), at: cue.start, message });
  };

  let previous = null;

  for (const cue of cues) {
    const text = cueText(cue);
    const duration = cue.end - cue.start;
    const lineCount = cue.text ? cue.text.split('\n').length : 0;

    if (duration <= 0) push(cue, 'negative-duration', `时长为 ${duration}ms`);
    if (!text) push(cue, 'empty', '没有文字内容');

    if (previous && cue.start < previous.end) {
      const overlap = previous.end - cue.start;
      push(cue, 'overlap', `与第 ${previous.index} 条重叠 ${overlap}ms`);
    }
    previous = cue;

    if (duration > 0 && duration < settings.minCueMs) {
      push(cue, 'too-short', `只显示 ${duration}ms，建议至少 ${settings.minCueMs}ms`);
    }
    if (duration > settings.maxCueMs) {
      push(cue, 'too-long', `持续 ${(duration / 1000).toFixed(1)}s，建议不超过 ${settings.maxCueMs / 1000}s`);
    }
    if (lineCount > settings.maxLines) {
      push(cue, 'too-many-lines', `有 ${lineCount} 行，建议不超过 ${settings.maxLines} 行`);
    }

    for (const line of cue.text.split('\n')) {
      const width = displayWidth(line);
      if (width > settings.maxLineWidth) {
        push(cue, 'line-too-long', `单行 ${width} 列，超过 ${settings.maxLineWidth} 列`);
        break;
      }
    }

    if (duration > 0 && text) {
      const cps = readingUnits(text) / (duration / 1000);
      if (cps > settings.maxCps) {
        push(cue, 'reading-speed', `阅读速度 ${cps.toFixed(1)} 字/秒，超过 ${settings.maxCps}`);
      }
    }
  }

  const durations = cues.map((cue) => cue.end - cue.start).filter((value) => value > 0);
  const totalMs = cues.reduce((sum, cue) => sum + Math.max(0, cue.end - cue.start), 0);
  const stats = {
    cues: cues.length,
    totalMs,
    firstStart: Math.min(...cues.map((cue) => cue.start)),
    lastEnd: Math.max(...cues.map((cue) => cue.end)),
    averageMs: durations.length ? Math.round(totalMs / durations.length) : 0,
    shortestMs: durations.length ? Math.min(...durations) : 0,
    longestMs: durations.length ? Math.max(...durations) : 0,
    issues: issues.length
  };

  return { issues, stats };
}
