---
name: video-archive
description: 收到抖音视频/图文链接或分享口令（含 v.douyin.com）要求看内容、转文字、总结、存档到知识库时使用。全本地：Edge 抓流 + 本机 faster-whisper 转写，不需要 API key，产出结构化 Obsidian 笔记（分析区 + 画面快照/原图 + 可折叠原文），不保存视频文件、用完即删。小红书未验证；B站/YouTube 请换用别的工具。
---

# video-archive（Codex 版）

把一条抖音链接变成一份 Obsidian 笔记。**全本地**：浏览器抓流 + faster-whisper 转写，无 API key、无云调用。

本目录假定为 `~/.codex/skills/video-archive`（Windows：`%USERPROFILE%\.codex\skills\video-archive`，PowerShell 里写 `$env:USERPROFILE\.codex\skills\video-archive`）。若放在别处，把下面的路径换成实际位置即可。

## 什么时候触发

用户消息里出现以下任一情况，直接跑，不要先问：

- `v.douyin.com` 短链，或抖音 App 分享出来的口令（"复制打开抖音……"那串不用管，链接就够了）
- `www.douyin.com/video/...` 或 `www.douyin.com/note/...` 链接
- 明确说"转文字 / 总结这个视频 / 存档 / 看看这个视频讲了什么"

不触发：小红书（未验证，失败率高）、B站、YouTube。用户要求这些站点时说明本技能只验证了抖音，建议换对应插件或直接给原文。

## 跑之前先自检

```bash
node "$HOME/.codex/skills/video-archive/scripts/video2note.mjs" --doctor
# Windows PowerShell:
node "$env:USERPROFILE\.codex\skills\video-archive\scripts\video2note.mjs" --doctor
```

返回 JSON，逐项看：

| 字段 | 期望 | 不达标怎么办 |
|---|---|---|
| `edge` | Edge 可执行文件路径 | 装 Edge，或设 `VIDEO_ARCHIVE_EDGE` |
| `python` | Python 版本号 | 装 Python 3 并进 PATH，或设 `VIDEO_ARCHIVE_PYTHON` |
| `fasterWhisper` | 版本号 | `pip install faster-whisper`（含 numpy/av） |
| `ffmpeg` | 版本行 | 装 ffmpeg 并进 PATH，或设 `VIDEO_ARCHIVE_FFMPEG` |
| `vault` / `vaultExists` | 知识库根目录且存在 | 设 `VIDEO_ARCHIVE_VAULT` |
| `asrScript` | `true` | 同目录缺 `transcribe.py`，重新拷一份 |

任一项 fail 就先装好再跑，不要硬跑。doctor 只检查，不下载模型。

## 运行

```bash
node "$env:USERPROFILE\.codex\skills\video-archive\scripts\video2note.mjs" "<分享链接或口令里的 url>" --json
```

参数：`--json`（机读结果）、`--out <md>`（指定输出文件名）、`--model <名>`（默认 `large-v3-turbo`）、`--keep`（保留临时音视频，默认删）。

输出 JSON 字段：`notePath`、`mode`（video|gallery）、`tier`（轻量/标准/深度，按字数分档）、`frames`、`images`、`text`、`duration`、`elapsedSec`。

正常 20–60 秒（首次转写要下约 1.6GB 模型，明显更久）。视频只留 4 张快照，图文最多 9 张原图；下载的音视频放在系统临时目录，跑完即删。同一链接重跑会复用已有笔记文件，不会生成第二份。

## 配置（环境变量，都有默认值）

| 变量 | 默认 | 说明 |
|---|---|---|
| `VIDEO_ARCHIVE_VAULT` | 当前工作目录 | 知识库根；笔记与附件都落在这下面 |
| `VIDEO_ARCHIVE_SUBDIR` | `03-外部资源` | 笔记写到 `<subdir>/短视频/`，附件写到 `_attachments/短视频/<id>/` |
| `VIDEO_ARCHIVE_EDGE` | 自动找 Edge | Edge 可执行文件路径（脚本也试 `Program Files` 两个默认位置） |
| `VIDEO_ARCHIVE_PYTHON` | `python` | 装了 faster-whisper 的解释器 |
| `VIDEO_ARCHIVE_FFMPEG` | `ffmpeg` | 抽帧用 |
| `HF_ENDPOINT` | 脚本内默认 `https://hf-mirror.com` | 模型下载源，国内网络慢就换镜像 |
| `VIDEO_ARCHIVE_MODEL` | `large-v3-turbo` | 转写模型，合法值只有 `tiny` / `base` / `small` / `medium` / `large-v2` / `large-v3` / `large-v3-turbo` / `distil-large-v3`；非法值直接退出（码 2）并列出可选值，不会回落到默认。`--model` 优先于它 |
| `VIDEO_ARCHIVE_DEVICE` | `auto` | `auto`：先 cuda/float16，失败退 cpu/int8；`cpu`：只 cpu/int8；`cuda`：只 cuda/float16，机器没有可用 CUDA 就直接报错、不回退。显存不足设 `cpu` |

## 跑完必须做

1. **修 ASR 错字**：中文口语 + 英文术语最容易错（会话→绘画、MemOS→Mimos）。拿不准的标"（转写存疑）"，不要猜成确定事实。
2. **核实断言**：视频里出现具体产品、版本、数据时先查证；查不到就写"未见可靠来源"。
3. **区分事实与话术**：星数、排行榜、"神器/必装/血赚"这类标为营销话术。
4. **把分析写进笔记**：`<!-- ANALYSIS:START -->` 与 `<!-- ANALYSIS:END -->` 之间，脚本只写占位（`_（待补）_`），分析由你补；保留这两个标记，不要删。
5. **图文帖**：内容基本都在图片里，先把 `原图` 那几张读了再总结，不要只看标题。

## 失败处理

- `no media stream` / `all candidates failed`：重跑一次；仍失败就直说没抓到，不要编内容。
- 需要登录/验证的内容：脚本用的是干净浏览器、无登录态，抓不到就是抓不到，直说。
- 转写乱码或空：先用 `--model medium` 重试（快、占显存少）；仍不行报告失败。
- `Cannot find package 'playwright-core'`：在技能目录执行 `npm install playwright-core`。
- 抽帧失败但转写成功：照常交付文字分析，说明没有画面快照。

## 依赖速查

Edge、Python 3 + faster-whisper、ffmpeg、Node.js 22.19+ 或 24+（`node --version` 核对）。完整安装步骤见仓库 `docs/codex.md` 与 `docs/install.md`。
