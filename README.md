# dsh-video-archive

把一个抖音视频/图文链接变成一份 Obsidian 笔记：本机 Edge 抓页面与音视频流，faster-whisper 在本机 GPU/CPU 转写，不需要 API key，内容不出本机。

## 能力

| 能力 | 行为 | 验证状态 |
|---|---|---|
| 抖音视频 | 抓音轨 → 本机转写 → 4 张画面快照 + 可折叠全文 | 已验证 |
| 抖音图文 | 抓正文 + 最多 9 张原图 | 已验证 |
| 小红书 | 同样走链接抓取 + 转写 | 未验证 |
| B 站 / YouTube | 不适用，用专门的插件（如 `dsh-bilibili-video-summary`） | 不推荐 |

| 细节 | 说明 |
|---|---|
| 笔记分级 | 正文 < 500 字「轻量」、< 3000 字「标准」、≥ 3000 字「深度」；后两档额外附带时间戳全文 |
| 磁盘占用 | 不保存视频：视频只留 4 张 640 宽快照，图文留最多 9 张原图；临时音视频在结束时删除（`--keep` 保留临时目录） |
| 重复链接 | 同一个 `final_url` 重跑会复用已有笔记文件，不重复生成 |
| 外网依赖 | 只有首次下载 whisper 模型（约 1.6 GB），之后走本地缓存 |

## 30 秒快速开始

前置：Node 22.19+ / 24+、Microsoft Edge、Python 3.10+ 与 `faster-whisper`、ffmpeg。装法见 [docs/install.md](docs/install.md)。

```bash
git clone https://github.com/Rocky08555/dsh-video-archive
cd dsh-video-archive
npm install
node skills/video-archive/scripts/video2note.mjs --doctor
node skills/video-archive/scripts/video2note.mjs "https://v.douyin.com/xxxxx/" --json
```

> 离线或不想拉包：跳过 `npm install`，把已有 checkout 里的 `node_modules/playwright-core` 拷到仓库根即可（见 [docs/codex.md](docs/codex.md) 里「没网/想复用已有 checkout」那段）。

笔记默认落到 `./03-外部资源/短视频/`。指定知识库再跑：

```powershell
$env:VIDEO_ARCHIVE_VAULT = "D:\my-vault"
node skills/video-archive/scripts/video2note.mjs --doctor
```

```bash
export VIDEO_ARCHIVE_VAULT=/path/to/vault
```

作为技能用（推荐）：把本包装进 DSH（见 [docs/install.md](docs/install.md)），之后把链接发给 agent 说「用 video-archive 存档」，agent 自己跑脚本、自己补分析区。

## 依赖

| 依赖 | 用途 | 缺失后果 |
|---|---|---|
| Node.js 22.19+ 或 24+ | 跑 `video2note.mjs` | 不能运行 |
| Microsoft Edge（Chrome 亦可，用 `VIDEO_ARCHIVE_EDGE` 指定） | 抓抖音页面与音视频流 | 不能抓取 |
| Python 3.10+ 与 `faster-whisper` | 语音转写 | 只能出图文/画面，没有文字 |
| ffmpeg（含 ffprobe） | 抽关键帧 | 没有画面快照 |
| `playwright-core` | 驱动浏览器 | `npm install` 自动装 |

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `VIDEO_ARCHIVE_VAULT` | 当前目录 | 知识库根目录 |
| `VIDEO_ARCHIVE_SUBDIR` | `03-外部资源` | 笔记落在 `<subdir>/短视频/` |
| `VIDEO_ARCHIVE_EDGE` | 自动探测（Windows 两个常见安装路径、macOS `/Applications`） | 浏览器可执行文件 |
| `VIDEO_ARCHIVE_PYTHON` | `python` | 装了 `faster-whisper` 的解释器 |
| `VIDEO_ARCHIVE_FFMPEG` | `ffmpeg` | 抽帧用 |
| `VIDEO_ARCHIVE_MODEL` | `large-v3-turbo` | 转写模型。合法值只有 `tiny`、`base`、`small`、`medium`、`large-v2`、`large-v3`、`large-v3-turbo`、`distil-large-v3`；非法值直接退出（码 2）并列出可选值，不会回落到默认 |
| `VIDEO_ARCHIVE_DEVICE` | `auto` | `auto` = 先试 CUDA，失败自动退 CPU；`cpu` = 只用 CPU（int8）；`cuda` = 硬指定 GPU，机器没有 CUDA 会报错且不回退 |
| `HF_ENDPOINT` | `https://hf-mirror.com` | 模型下载源，国内网络用得上 |

模型优先级：`--model` > `VIDEO_ARCHIVE_MODEL` > 默认 `large-v3-turbo`。

## 命令行参数

```
node skills/video-archive/scripts/video2note.mjs <url> [--doctor] [--json] [--out <md>] [--model <名>] [--keep]
```

- `--doctor`：只体检，不抓取。
- `--json`：结果以 JSON 打到 stdout，进度信息走 stderr。
- `--out`：指定笔记路径，跳过自动命名与复用。
- `--keep`：保留临时目录里的原始音视频（默认删除）。

## 笔记长什么样

```
<vault>/03-外部资源/短视频/2026-11-10-标题.md
<vault>/_attachments/短视频/<视频id>/f1.jpg … f4.jpg
```

正文顺序：frontmatter（`source` / `final_url` / `type` / `captured` / `asr_model` / `duration_sec` / `tier` / `tags`）→ 标题 → 作者原描述 → `## 分析总结`（脚本只写占位，由 agent 补）→ 画面快照 / 原图 → 折叠的原始转录与带时间戳全文。

## 支持站点

- 抖音视频：已验证。
- 抖音图文：已验证。
- 小红书：脚本里保留了 xhs cookie 的抓取逻辑，但**未验证**。
- B 站 / YouTube：不属于本包目标，用别的插件。

抓取用的是干净浏览器实例（无登录态）。需要登录才能看的内容会失败。

## 已知限制

- 需要真实浏览器，只能在装有 Edge/Chrome 的桌面机上跑。
- 首次运行下载 whisper 模型约 1.6 GB；之后复用缓存。
- 模型越大越准越慢。GPU 上 5 分钟视频的转写开销：`small` 约 1 分钟，`large-v3-turbo` 约 20 秒量级。显存不足就设 `VIDEO_ARCHIVE_DEVICE=cpu`。
- 转写是语音识别，人名、型号、专业名词会错；笔记里的分析区要人工/agent 对照画面校正。
- 抓不到音视频流（`no media stream`、`all candidates failed`）时重跑一次；仍失败就是抓不到，不做兜底。
- 图文帖只取正文图，页面 UI 图标不取。

## 文档

- [安装与依赖](docs/install.md)：Windows / macOS 逐步安装、`--doctor` 体检、模型与设备调优。
- [微信接入](docs/wechat.md)：手机微信发链接，笔记自动进 Obsidian。注意这是 DSH 的 IM 集成 + 本技能的组合，不是本包功能。
- [English README](README.en.md)

## License

MIT © Rocky08555
