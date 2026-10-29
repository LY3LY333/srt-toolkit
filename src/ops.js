/**
 * Transformations that operate on parsed cues. Each one returns a fresh array so
 * callers can keep the original around for comparison.
 */

import { SubtitleError } from './timestamp.js';

function clone(cue) {
  return { ...cue, lines: [...(cue.lines ?? [])] };
}

/**
 * Move every cue by `ms`. Negative results are either clamped (default) or
 * rejected, because a subtitle starting before zero breaks most players.
 */
export function shift(cues, ms, options = {}) {
  const { allowNegative = false } = options;
  return cues.map((cue, i) => {
    const start = cue.start + ms;
    const end = cue.end + ms;
    if (!allowNegative && (start < 0 || end < 0)) {
      throw new SubtitleError(`平移后第 ${i + 1} 条会变成负时间，换一个小一点的偏移量`);
    }
    return { ...clone(cue), start: Math.max(0, start), end: Math.max(0, end) };
  });
}

/**
 * Multiply all timings — used to fit a subtitle authored for 23.976 fps onto a
 * 25 fps release (factor 25 / 23.976).
 */
export function scale(cues, factor) {
  if (!Number.isFinite(factor) || factor <= 0) throw new SubtitleError(`缩放系数不合法：${factor}`);
  return cues.map((cue) => {
    const start = Math.round(cue.start * factor);
    const end = Math.round(cue.end * factor);
    if (end <= start) throw new SubtitleError(`缩放后字幕时长变成 0：第 ${cue.index} 条`);
    return { ...clone(cue), start, end };
  });
}

/** Scale so the last cue ends exactly at `targetMs`. */
export function scaleTo(cues, targetMs) {
  const last = cues.reduce((max, cue) => Math.max(max, cue.end), 0);
  if (last === 0) throw new SubtitleError('字幕总时长为 0，无法按目标时长缩放');
  return scale(cues, targetMs / last);
}

/** Concatenate tracks and renumber by start time. */
export function merge(...tracks) {
  const all = tracks.flat().map((cue) => clone(cue));
  if (all.length === 0) throw new SubtitleError('没有可合并的字幕');

  return all
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((cue, index) => ({ ...cue, index: index + 1 }));
}

/** Drop cues that fall completely outside [from, to]. */
export function slice(cues, from, to) {
  return cues
    .filter((cue) => cue.end > from && cue.start < to)
    .map((cue) => ({ ...clone(cue), start: Math.max(cue.start, from), end: Math.min(cue.end, to) }));
}
