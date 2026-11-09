---
name: video-archive
description: 收到抖音等短视频链接或分享口令（含 v.douyin.com）要求看内容、转文字、总结、存档时使用。本地抓取+GPU 转写，产出结构化笔记（分析区 + 画面快照/原图 + 可折叠原文），不保存视频文件、不留临时文件。
---

# video-archive

把一条视频/图文链接变成一份 Obsidian 笔记。**全本地**：浏览器抓流 + faster-whisper 转写，不需要 API key。

## 什么时候触发
用户消息里出现 `v.douyin.com` 链接或抖音分享口令（那串乱码不用管），或明确说"转文字/总结/存档/看看这个视频"。**不要问，直接跑。**

只验证过抖音。**小红书未验证**；**B站/YouTube 用别的工具**（如 `dsh-bilibili-video-summary`）。用户要求这些站点时说明只验证了抖音，别硬跑。

## 跑之前先自检
```
node <skill目录>/scripts/video2note.mjs --doctor
```
返回 JSON：`edge`（浏览器）、`python`、`ffmpeg`、`fasterWhisper`、`vault`。任一项 fail 就先装，别硬跑。

## 跑
```
node <skill目录>/scripts/video2note.mjs "<url>" --json
```
输出 JSON：`notePath`、`mode`(video|gallery)、`tier`(轻量/标准/深度)、`frames`、`images`、`text`、`elapsedSec`。
正常 20-60 秒。视频只留 4 张快照，图文留最多 9 张原图，音视频文件用完即删。

## 配置（环境变量，都有默认值）
| 变量 | 默认 | 说明 |
|---|---|---|
| `VIDEO_ARCHIVE_VAULT` | 当前目录 | 知识库根 |
| `VIDEO_ARCHIVE_SUBDIR` | `03-外部资源` | 笔记落在 `<subdir>/短视频/` |
| `VIDEO_ARCHIVE_EDGE` | 自动找 Edge | 浏览器可执行文件 |
| `VIDEO_ARCHIVE_PYTHON` | `python` | 装了 faster-whisper 的解释器 |
| `VIDEO_ARCHIVE_FFMPEG` | `ffmpeg` | 抽帧用 |
| `VIDEO_ARCHIVE_MODEL` | `large-v3-turbo` | 转写模型，合法值只有 `tiny` / `base` / `small` / `medium` / `large-v2` / `large-v3` / `large-v3-turbo` / `distil-large-v3`；非法值直接退出（码 2）并列出可选值，不会回落到默认。`--model` 优先于它 |
| `VIDEO_ARCHIVE_DEVICE` | `auto` | `auto`：先 cuda/float16，失败退 cpu/int8；`cpu`：只 cpu/int8；`cuda`：只 cuda/float16，机器没有可用 CUDA 就直接报错、不回退。显存不足设 `cpu` |
| `HF_ENDPOINT` | `https://hf-mirror.com` | 模型下载源 |

## 跑完必须做
1. **修 ASR 错字**：中文口语+英文术语最容易错（会话→绘画、MemOS→Mimos）。拿不准标"（转写存疑）"。
2. **核实断言**：涉及具体产品/版本时查证，查不到就说没找到。
3. **区分事实与话术**：星数、排行榜、"神器/必装"标注为营销。
4. **把分析写进** `<!-- ANALYSIS:START -->` 与 `<!-- ANALYSIS:END -->` 之间（脚本只写占位，分析由你补）。
5. 图文帖内容在图片里时，读图后再总结，别只根据标题猜。

## 失败处理
- `no media stream` / `all candidates failed`：重跑一次；仍失败直说。
- 需登录的内容：脚本用干净浏览器无登录态，会失败，直说。
- 转写乱码：`--model medium` 重试。
