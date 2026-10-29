import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

import { parse } from './parse.js';
import { serialize } from './serialize.js';
import { merge, scale, scaleTo, shift, slice } from './ops.js';
import { check, DEFAULTS } from './check.js';
import { SubtitleError, formatTimestamp, parseDuration } from './timestamp.js';

const HELP = `srt — 字幕工具箱（SRT / VTT）

用法：
  srt info <文件>                          概要统计
  srt shift <文件> --by +1.5s [--out 文件] 整体平移
  srt scale <文件> --factor 1.042 | --to 01:30:00
  srt convert <文件> --to vtt|srt [--out 文件]
  srt merge <文件...> --out 文件           按时间合并多条字幕
  srt slice <文件> --from 00:10:00 --to 00:20:00
  srt check <文件...> [--json]             检查阅读速度、行长、重叠……

通用选项：
  --out <文件>     写入文件（默认输出到 stdout）
  --in-place       覆盖原文件
  --json           机器可读输出

检查选项：
  --cps <n>        最大阅读速度，默认 ${DEFAULTS.maxCps} 字/秒
  --max-line <n>   单行最大列数，默认 ${DEFAULTS.maxLineWidth}
  --max-lines <n>  单条最多行数，默认 ${DEFAULTS.maxLines}

时长写法：+1.5s  -750ms  90  +00:00:02,500
退出码：0 正常，1 检查发现问题，2 用法/格式错误
`;

const USAGE_ERROR = 2;

export function parseArgs(argv) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[body] = true;
      } else {
        flags[body] = next;
        i += 1;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      flags[arg.slice(1)] = true;
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

function readSubtitle(file, options = {}) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new SubtitleError(`读不到文件：${file}`);
  }
  const parsed = parse(text, options);
  return { ...parsed, file };
}

function emit(content, flags, fallbackName) {
  if (flags['in-place']) {
    const file = flags.file ?? fallbackName;
    writeFileSync(file, content, 'utf8');
    return `✓ 已写入 ${file}`;
  }
  if (typeof flags.out === 'string') {
    const file = resolve(flags.out);
    writeFileSync(file, content, 'utf8');
    return `✓ 已写入 ${file}`;
  }
  return content;
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function commandInfo(ctx) {
  const { cues, format, warnings, file } = readSubtitle(ctx.positional[0]);
  const { stats } = check(cues);
  const overlaps = stats.issues;

  if (ctx.flags.json) {
    ctx.io.out(JSON.stringify({ file, format, warnings, ...stats }, null, 2));
    return 0;
  }

  const total = formatTimestamp(stats.lastEnd - stats.firstStart).replace(/,\d{3}$/, '');
  ctx.io.out(`${basename(file)}  ${format.toUpperCase()}  ${stats.cues} 条  总长 ${total}`);
  ctx.io.out(
    `平均 ${formatSeconds(stats.averageMs)}  最短 ${formatSeconds(stats.shortestMs)}  最长 ${formatSeconds(stats.longestMs)}`
  );
  if (warnings.length > 0) ctx.io.out(`⚠ ${warnings.length} 段格式异常已跳过`);
  return 0;
}

function commandShift(ctx) {
  const [file] = ctx.positional;
  const { cues, format } = readSubtitle(file);
  if (ctx.flags.by === undefined) throw new SubtitleError('缺少 --by，例如 --by +1.5s');

  const ms = parseDuration(String(ctx.flags.by));
  const moved = shift(cues, ms, { allowNegative: Boolean(ctx.flags['allow-negative']) });
  const output = emit(serialize(moved, format), { ...ctx.flags, file }, file);
  ctx.io.out(ctx.flags.out || ctx.flags['in-place'] ? output : output.trimEnd());
  return 0;
}

function commandScale(ctx) {
  const [file] = ctx.positional;
  const { cues, format } = readSubtitle(file);

  let scaled;
  if (ctx.flags.to !== undefined) {
    scaled = scaleTo(cues, parseDuration(String(ctx.flags.to)));
  } else if (ctx.flags.factor !== undefined) {
    scaled = scale(cues, Number(ctx.flags.factor));
  } else {
    throw new SubtitleError('需要 --factor 1.042 或 --to 01:30:00');
  }

  const output = emit(serialize(scaled, format), { ...ctx.flags, file }, file);
  ctx.io.out(ctx.flags.out || ctx.flags['in-place'] ? output : output.trimEnd());
  return 0;
}

function commandConvert(ctx) {
  const [file] = ctx.positional;
  const target = String(ctx.flags.to ?? '').toLowerCase();
  if (target !== 'srt' && target !== 'vtt') throw new SubtitleError('--to 只能是 srt 或 vtt');

  const { cues } = readSubtitle(file);
  const output = emit(serialize(cues, target), { ...ctx.flags, file }, file);
  ctx.io.out(ctx.flags.out || ctx.flags['in-place'] ? output : output.trimEnd());
  return 0;
}

function commandMerge(ctx) {
  const files = ctx.positional;
  if (files.length < 2) throw new SubtitleError('至少需要两个文件才能合并');

  const tracks = files.map((file) => readSubtitle(file).cues);
  const merged = merge(...tracks);
  const format = String(ctx.flags.to ?? (extname(files[0]).toLowerCase() === '.vtt' ? 'vtt' : 'srt'));
  const output = emit(serialize(merged, format), { ...ctx.flags, file: files[0] }, files[0]);
  ctx.io.out(ctx.flags.out ? output : output.trimEnd());
  return 0;
}

function commandSlice(ctx) {
  const [file] = ctx.positional;
  const from = ctx.flags.from === undefined ? 0 : parseDuration(String(ctx.flags.from));
  const { cues, format } = readSubtitle(file);
  const to = ctx.flags.to === undefined
    ? Math.max(...cues.map((cue) => cue.end))
    : parseDuration(String(ctx.flags.to));

  const cut = slice(cues, from, to);
  if (cut.length === 0) throw new SubtitleError('这个时间区间里没有字幕');
  const output = emit(serialize(cut, format), { ...ctx.flags, file }, file);
  ctx.io.out(ctx.flags.out || ctx.flags['in-place'] ? output : output.trimEnd());
  return 0;
}

function commandCheck(ctx) {
  const files = ctx.positional;
  if (files.length === 0) throw new SubtitleError('请至少给一个字幕文件');

  const options = {
    maxLineWidth: ctx.flags['max-line'] !== undefined ? Number(ctx.flags['max-line']) : DEFAULTS.maxLineWidth,
    maxLines: ctx.flags['max-lines'] !== undefined ? Number(ctx.flags['max-lines']) : DEFAULTS.maxLines,
    minCueMs: ctx.flags['min-ms'] !== undefined ? Number(ctx.flags['min-ms']) : DEFAULTS.minCueMs,
    maxCueMs: ctx.flags['max-ms'] !== undefined ? Number(ctx.flags['max-ms']) : DEFAULTS.maxCueMs,
    maxCps: ctx.flags.cps !== undefined ? Number(ctx.flags.cps) : DEFAULTS.maxCps
  };

  const report = [];
  let totalIssues = 0;
  let errors = 0;

  for (const file of files) {
    const { cues } = readSubtitle(file);
    const { issues, stats } = check(cues, options);
    totalIssues += issues.length;
    errors += issues.filter((issue) => issue.severity === 'error').length;
    report.push({ file: basename(file), stats, issues });
  }

  if (ctx.flags.json) {
    ctx.io.out(JSON.stringify({ files: report, issues: totalIssues, errors }, null, 2));
    return totalIssues > 0 ? 1 : 0;
  }

  for (const entry of report) {
    const codeWidth = Math.max(4, ...entry.issues.map((issue) => issue.code.length));
    for (const issue of entry.issues) {
      const at = formatTimestamp(issue.at, { separator: ',' }).slice(0, 8);
      ctx.io.out(`${entry.file}  #${String(issue.cue).padEnd(4)} ${at}  ${issue.code.padEnd(codeWidth)}  ${issue.message}`);
    }
    if (entry.issues.length === 0) {
      ctx.io.out(`✓ ${entry.file}  ${entry.stats.cues} 条没有问题`);
    }
  }

  if (totalIssues > 0) {
    ctx.io.out(`共 ${totalIssues} 个问题${errors > 0 ? `（${errors} 个错误）` : ''}`);
    return 1;
  }
  return 0;
}

const COMMANDS = {
  info: commandInfo,
  shift: commandShift,
  scale: commandScale,
  convert: commandConvert,
  merge: commandMerge,
  slice: commandSlice,
  check: commandCheck
};

/**
 * @param {string[]} argv
 * @param {{io?: {out: Function, err: Function}}} [options]
 */
export function run(argv, options = {}) {
  const io = options.io ?? {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`)
  };

  const { flags, positional } = parseArgs(argv);
  if (flags.version || flags.v) {
    io.out('srt-toolkit 0.1.0');
    return 0;
  }

  const command = positional.shift();
  if (!command || flags.help || flags.h || command === 'help') {
    io.out(HELP.trimEnd());
    return command ? 0 : USAGE_ERROR;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    io.err(`未知命令：${command}`);
    io.out(HELP.trimEnd());
    return USAGE_ERROR;
  }

  if (positional.length === 0) {
    io.err('缺少文件参数');
    return USAGE_ERROR;
  }

  try {
    return handler({ flags, positional, io });
  } catch (error) {
    if (error instanceof SubtitleError) {
      io.err(error.message);
      return USAGE_ERROR;
    }
    throw error;
  }
}
