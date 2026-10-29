import { formatTimestamp } from './timestamp.js';

const CRLF = '\r\n';

function bodyOf(cue) {
  const text = cue.text ?? '';
  return text.length > 0 ? text.replace(/\r\n?/g, '\n').split('\n') : [];
}

/**
 * SubRip. Cue numbers are rewritten from 1 so a merged or filtered file stays
 * valid, and CRLF is used because a lot of players are picky about it.
 */
export function toSrt(cues) {
  return cues
    .map((cue, index) => {
      const timing = `${formatTimestamp(cue.start, { separator: ',' })} --> ${formatTimestamp(cue.end, { separator: ',' })}`;
      return [String(index + 1), timing, ...bodyOf(cue)].join(CRLF);
    })
    .join(CRLF + CRLF)
    .concat(CRLF);
}

/**
 * WebVTT. Cue settings are dropped on purpose: they are presentation hints for
 * one player and would be meaningless (or wrong) after re-timing.
 */
export function toVtt(cues) {
  const blocks = cues.map((cue) => {
    const timing = `${formatTimestamp(cue.start, { separator: '.' })} --> ${formatTimestamp(cue.end, { separator: '.' })}`;
    const id = cue.id ? [cue.id] : [];
    return [...id, timing, ...bodyOf(cue)].join(CRLF);
  });

  return ['WEBVTT', ...blocks].join(CRLF + CRLF).concat(CRLF);
}

export function serialize(cues, format = 'srt') {
  return format === 'vtt' ? toVtt(cues) : toSrt(cues);
}
