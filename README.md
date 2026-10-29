# srt-toolkit

[![CI](https://github.com/LY3LY333/srt-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/LY3LY333/srt-toolkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A518.17-brightgreen.svg)](package.json)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

字幕工具箱：**平移时间轴、按帧率缩放、SRT ⇄ VTT 转换、合并、裁剪、检查阅读速度**。零依赖，一条命令搞定。

> A zero-dependency subtitle toolkit for SRT/VTT: shift, rescale, convert, merge, slice and lint. Timings are handled in integer milliseconds so nothing drifts.

---

## 为什么需要它

字幕错位是件很恼人的事：下载的字幕比视频晚 2 秒、蓝光版是 23.976 fps 而你的片源是 25 fps、中文字幕一句话太长来不及看。现成工具要么是 GUI、要么要装一堆依赖。

这个工具把常见操作压成一行命令，并且**顺手检查字幕质量**。

## 安装

```bash
git clone https://github.com/LY3LY333/srt-toolkit.git
cd srt-toolkit
node bin/srt.js info movie.srt
```

Node.js ≥ 18.17，无第三方依赖。

> 尚未发布到 npm，所以暂时不能用 `npx srt-toolkit`。下文命令里的 `srt` 都指 `node bin/srt.js`（`npm link` 后可直接用命令名）。

## 常用命令

```bash
# 整体推迟 2.5 秒（字幕比视频早）
srt shift movie.srt --by +2.5s --out fixed.srt

# 按帧率缩放：23.976 fps 的字幕适配 25 fps 片源
srt scale movie.srt --factor 1.0427 --out 25fps.srt

# 或者直接对齐到目标总时长
srt scale movie.srt --to 01:32:10 --out fixed.srt

# 格式互转
srt convert movie.srt --to vtt --out movie.vtt

# 合并两条字幕轨（比如中文 + 英文）
srt merge zh.srt en.srt --out both.srt

# 只保留某一段
srt slice movie.srt --from 00:10:00 --to 00:20:00 --out part2.srt

# 检查质量
srt check movie.srt
```

默认输出到 stdout，方便接管道；`--out` 写文件，`--in-place` 覆盖原文件。

## 检查字幕质量

```bash
$ srt check bad.srt
bad.srt  #1    00:00:01  reading-speed   阅读速度 16.7 字/秒，超过 9
bad.srt  #2    00:00:02  overlap         与第 1 条重叠 200ms
bad.srt  #3    00:00:04  too-short       只显示 100ms，建议至少 400ms
bad.srt  #4    00:00:05  too-many-lines  有 3 行，建议不超过 2 行
共 4 个问题（1 个错误）
```

| 检查项 | 说明 | 默认阈值 |
|---|---|---|
| `overlap` | 两条字幕时间重叠 | — |
| `negative-duration` | 结束时间早于开始时间 | — |
| `too-short` | 显示时间过短 | 400ms |
| `too-long` | 显示时间过长 | 7000ms |
| `too-many-lines` | 一条字幕行数过多 | 2 行 |
| `line-too-long` | 单行过长（中文按 2 列算） | 42 列 |
| `reading-speed` | 阅读速度过快 | 9 字/秒 |
| `empty` | 没有文字 | — |

阈值都能改：`--cps 12 --max-line 36 --max-lines 2 --min-ms 500 --max-ms 6000`。

退出码：有问题返回 `1`，可以直接接在 CI 或批处理里。

## 阅读速度怎么算

不同语言「字」不是一个量级，所以统一换算成**阅读单位**：

- 一个中文/日文/韩文字符 = 1 个单位
- 两个拉丁字母 = 1 个单位
- 空格不计数

9 单位/秒大致对应中文电视字幕的舒适上限，也大致对应英文 18 字符/秒。这样一条阈值就能同时管中英字幕。

## 时间精度

所有时间统一用**整数毫秒**存储和运算：

- 解析 `01:02:03,456` / `01:02:03.456` / `02:03,456` / `00:01:00`（可省略毫秒）
- 毫秒位自动补齐：`,4` → 400ms，`,45` → 450ms，`,456` → 456ms
- 缩放用 `Math.round`，一小时内误差不超过 1ms

用浮点秒数做运算的话，几百条字幕之后就会偏移一两帧——这正是「字幕越到后面越不准」的典型原因。

## 格式支持

| 能力 | SRT | VTT |
|---|---|---|
| 解析 | ✅ 编号可省略、支持 CRLF / BOM | ✅ `WEBVTT` 头、`NOTE` / `STYLE` 块、cue id、cue settings |
| 输出 | ✅ 从 1 重新编号、CRLF | ✅ 带 `WEBVTT` 头、用 `.` 分隔毫秒 |
| 富文本标签 | 原样保留（`<i>`、`{\an8}`） | 原样保留 |

转换时会**丢弃 VTT 的 cue settings**（`align:start position:10%` 之类）：它们是给某个播放器的排版提示，重新计时后往往就是错的。

## 设计取舍

- **容错解析**：遇到坏段落默认跳过并给出 warning，`strict: true` 才抛错——真实字幕文件经常有个别坏块，不该让整个文件失败。
- **不碰原文件**：所有变换都返回新数组，输入永远不变（有测试盯着）。
- **拒绝负时间**：平移导致负时间会报错，除非显式 `--allow-negative`，因为负时间会让多数播放器直接不显示。
- **合并会重排**：按开始时间排序并重新编号，所以合并后的文件仍然是合法 SRT。

## 已知限制

- 不支持 ASS/SSA（样式系统复杂，另做更合适）
- 不做自动打轴（那需要语音识别）
- 只处理 UTF-8 输入（BOM 会被自动去掉；GBK 文件请先转码）
- `reading-speed` 是启发式的：说唱、快节奏台词会被误报，可以用 `--cps` 放宽或忽略

## 开发

```bash
node --test     # 55 个测试
```

| 文件 | 职责 |
|---|---|
| `src/timestamp.js` | 时间戳解析/格式化、时长表达式（`+1.5s`、`-750ms`） |
| `src/parse.js` | SRT/VTT 容错解析，坏块降级为 warning |
| `src/serialize.js` | 两种格式输出，编号重排 |
| `src/ops.js` | shift / scale / scaleTo / merge / slice，纯函数 |
| `src/check.js` | 8 条规则 + 统计 |
| `src/cli.js` | 命令分发、参数解析、输出 |

## License

MIT © 2026 六月风
