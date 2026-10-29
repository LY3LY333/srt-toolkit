/**
 * Timestamps are handled as integer milliseconds everywhere. Rounding floats
 * would drift by a frame or two after a few hundred cues, which is exactly the
 * kind of bug that makes subtitles feel "off" near the end of a movie.
 */

export class SubtitleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SubtitleError';
  }
}

const STAMP = /^(?:(\d+):)?(\d{1,3}):(\d{1,2})(?:[,.](\d{1,3}))?$/;

/**
 * Accepts `01:02:03,456`, `1:02:03.456`, `02:03,456` and `00:01:00` (no millis).
 * @param {string} text
 * @returns {number} milliseconds
 */
export function parseTimestamp(text) {
  if (typeof text !== 'string') throw new SubtitleError('时间戳必须是字符串');
  const match = STAMP.exec(text.trim());
  if (!match) throw new SubtitleError(`看不懂的时间戳：「${text}」`);

  const hours = match[1] === undefined ? 0 : Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = match[4] ?? '0';

  if (minutes > 59 || seconds > 59) throw new SubtitleError(`时间戳超出范围：「${text}」`);

  // `4` means 400ms, `45` means 450ms, `456` means 456ms.
  const millis = Number(fraction.padEnd(3, '0').slice(0, 3));

  return hours * 3600_000 + minutes * 60_000 + seconds * 1000 + millis;
}

function pad(value, width = 2) {
  return String(value).padStart(width, '0');
}

/**
 * @param {number} ms
 * @param {{separator?: ','|'.', forceHours?: boolean, shortHours?: boolean}} [options]
 */
export function formatTimestamp(ms, options = {}) {
  const { separator = ',', forceHours = true } = options;
  if (!Number.isFinite(ms) || ms < 0) throw new SubtitleError(`无法格式化时间戳：${ms}`);

  const total = Math.round(ms);
  const hours = Math.floor(total / 3600_000);
  const minutes = Math.floor((total % 3600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;

  const tail = `${pad(minutes)}:${pad(seconds)}${separator}${pad(millis, 3)}`;
  if (!forceHours && hours === 0) return tail;
  return `${pad(hours)}:${tail}`;
}

/** Parse `+1.5s`, `-750ms`, `1:02` (minutes:seconds), `00:00:02,500` into milliseconds. */
export function parseDuration(text) {
  if (typeof text !== 'string' || !text.trim()) throw new SubtitleError('时间长度不能为空');
  const raw = text.trim();
  const sign = raw.startsWith('-') ? -1 : 1;
  const body = raw.replace(/^[+-]/, '');

  // HH:MM:SS[,mmm]
  if (/^\d+:\d{2}:\d{2}([,.]\d{1,3})?$/.test(body)) {
    return sign * parseTimestamp(body);
  }

  // MM:SS[,mmm]
  const minutesSeconds = /^(\d+):(\d{2})(?:[,.](\d{1,3}))?$/.exec(body);
  if (minutesSeconds) {
    const millis = Number((minutesSeconds[3] ?? '0').padEnd(3, '0').slice(0, 3));
    return sign * (Number(minutesSeconds[1]) * 60_000 + Number(minutesSeconds[2]) * 1000 + millis);
  }

  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i.exec(body);
  if (!match) throw new SubtitleError(`看不懂的时长：「${text}」，试试 +1.5s / -750ms / 90`);

  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const factor = { ms: 1, s: 1000, m: 60_000, h: 3600_000 }[unit];
  return sign * Math.round(amount * factor);
}
