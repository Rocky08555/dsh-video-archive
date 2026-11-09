# 安装与依赖

本页给 Windows 和 macOS 的逐步安装、`--doctor` 体检、模型与设备调优。装完回到 [README](../README.md) 跑一条链接即可。

## 检查清单

| 依赖 | 版本 | 检查命令 | 期望 |
|---|---|---|---|
| Node.js | 22.19+ 或 24+ | `node --version` | `v22.19.0` 及以上 |
| Microsoft Edge | 任意近期版本 | `--doctor` 里的 `edge` | 给出 exe/app 路径 |
| Python | 3.10+ | `python --version` | 3.10 及以上 |
| faster-whisper | 1.x | `python -c "import faster_whisper;print(faster_whisper.__version__)"` | 版本号 |
| ffmpeg / ffprobe | 任意近期版本 | `ffmpeg -version` | 版本行 |

## Windows

1）Node.js

```powershell
winget install --id OpenJS.NodeJS.LTS -e
node --version
```

winget 源不可用时，从 <https://nodejs.org> 下 LTS 安装包。要 24 就用 `OpenJS.NodeJS`。

2）Microsoft Edge

Win10/11 一般预装。没有的话：

```powershell
winget install --id Microsoft.Edge -e
```

或从 <https://www.microsoft.com/edge> 装。Edge 只用来抓流，不需要登录，也不接管你的日常浏览器。

3）Python 与 faster-whisper

建议单独建一个虚拟环境，别污染全局解释器：

```powershell
winget install --id Python.Python.3.12 -e
python -m venv $env:USERPROFILE\.dsh\tools\venv-media
$env:USERPROFILE\.dsh\tools\venv-media\Scripts\python.exe -m pip install -U pip
$env:USERPROFILE\.dsh\tools\venv-media\Scripts\python.exe -m pip install faster-whisper
```

NVIDIA 显卡想用 GPU 加速，再把 CUDA 运行库装进同一个环境（`transcribe.py` 会把 `site-packages/nvidia/*/bin` 加进 `PATH` 和 DLL 搜索路径，所以装在 venv 里就够了）：

```powershell
$env:USERPROFILE\.dsh\tools\venv-media\Scripts\python.exe -m pip install nvidia-cublas-cu12 nvidia-cudnn-cu12 nvidia-cuda-nvrtc-cu12
```

装好后把解释器路径告诉脚本（写进用户环境变量，一次到位）：

```powershell
[Environment]::SetEnvironmentVariable("VIDEO_ARCHIVE_PYTHON", "$env:USERPROFILE\.dsh\tools\venv-media\Scripts\python.exe", "User")
```

每个新开的终端要重新读环境变量；不想用环境变量，也可以在调用前临时 `$env:VIDEO_ARCHIVE_PYTHON = "..."`。

4）ffmpeg

```powershell
winget install --id Gyan.FFmpeg -e
ffmpeg -version
ffprobe -version
```

或下 <https://www.gyan.dev/ffmpeg/builds/> 的 essentials 包，把 `bin` 加进 `PATH`。没有 ffmpeg 时不报错，只是没有画面快照。

## macOS

```bash
brew install --cask microsoft-edge
brew install python@3.12 ffmpeg
python3.12 -m venv ~/.dsh/tools/venv-media
~/.dsh/tools/venv-media/bin/python -m pip install -U pip
~/.dsh/tools/venv-media/bin/python -m pip install faster-whisper
```

Edge 装好后脚本会自动找 `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`。Apple Silicon 没有 CUDA，`VIDEO_ARCHIVE_DEVICE` 保持 `auto` 即可：试 CUDA 失败自动走 CPU（int8）。

```bash
export VIDEO_ARCHIVE_PYTHON="$HOME/.dsh/tools/venv-media/bin/python"
```

注意 `python` 在 macOS 上常指 `python3`：脚本默认调 `python`，所以这里显式设 `VIDEO_ARCHIVE_PYTHON` 最省事。

## 体检：--doctor

```bash
node skills/video-archive/scripts/video2note.mjs --doctor
```

只体检，不抓取、不下载。正常输出如下（Windows 实测结构，知识库路径换成占位；`fasterWhisper` 要报出版本号才算通）：

```json
{
  "vault": "D:\\my-vault",
  "vaultExists": true,
  "noteDir": "D:\\my-vault\\03-外部资源\\短视频",
  "edge": "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "python": "3.12.10",
  "ffmpeg": "ffmpeg version 9.0.2-essentials_build-www.gyan.dev Copyright (c) 2000-2026 the FFmpeg developers",
  "fasterWhisper": "1.2.1",
  "playwrightCore": "ok",
  "asrScript": true,
  "asrModel": "large-v3-turbo",
  "device": "auto"
}
```

| 字段 | 含义 | 不通怎么办 |
|---|---|---|
| `vault` / `vaultExists` | 知识库根与是否存在 | 设 `VIDEO_ARCHIVE_VAULT`，或在知识库目录里运行 |
| `noteDir` | 笔记最终落点 | 由 `vault` + `VIDEO_ARCHIVE_SUBDIR` 决定 |
| `edge` | 探测到的浏览器 | 显示 `(not found)` → 装 Edge 或设 `VIDEO_ARCHIVE_EDGE` |
| `python` | 解释器版本，`fail: ...` 表示调不起来 | 设 `VIDEO_ARCHIVE_PYTHON` |
| `ffmpeg` | ffmpeg 版本行 | 装 ffmpeg 或设 `VIDEO_ARCHIVE_FFMPEG` |
| `fasterWhisper` | 库版本；`fail: Traceback ... No module named 'faster_whisper'` 说明装错解释器 | 在 `VIDEO_ARCHIVE_PYTHON` 指向的环境里 `pip install faster-whisper` |
| `asrScript` | `transcribe.py` 在不在 | `false` 说明包不完整，重新拉仓库 |
| `asrModel` / `device` | 当前生效的模型与设备 | 见下一节 |

退出码：`edge` 找到且 `asrScript` 为真 → 0；否则 1。`fasterWhisper` 失败**不会**让退出码变 1（只影响转写），看到版本号或 `fail` 要自己判断。

`--doctor` 之前会先校验模型名：传了非法 `VIDEO_ARCHIVE_MODEL` / `--model` 时脚本直接退出（码 2），连体检 JSON 都不打印，stderr 只有：

```
unsupported model: gpt-4
supported: tiny, base, small, medium, large-v2, large-v3, large-v3-turbo, distil-large-v3
```

## 调优：模型与设备

| 变量 | 默认 | 作用 |
|---|---|---|
| `VIDEO_ARCHIVE_MODEL` | `large-v3-turbo` | `tiny` / `base` / `small` / `medium` / `large-v2` / `large-v3` / `large-v3-turbo` / `distil-large-v3` |
| `VIDEO_ARCHIVE_DEVICE` | `auto` | `auto`：先 cuda/float16，失败退 cpu/int8；`cpu`：只 cpu/int8；`cuda`：只 cuda/float16 |

- 优先级：`--model <名>` > `VIDEO_ARCHIVE_MODEL` > 默认。
- `cuda` 是硬指定：机器没有可用的 CUDA/cuDNN 时报错退出，不会自动退 CPU。不确定就用 `auto`。
- 精度与速度取舍：模型越大越准越慢。GPU 上 5 分钟视频，`small` 约多 1 分钟，`large-v3-turbo` 约 20 秒量级。
- 显存不够（OOM）：`VIDEO_ARCHIVE_DEVICE=cpu`，或者换小模型。
- 转写出现大量乱码：换 `--model medium` 或 `large-v3` 重跑一次再判断。

```powershell
$env:VIDEO_ARCHIVE_MODEL = "small"
$env:VIDEO_ARCHIVE_DEVICE = "cpu"
node skills/video-archive/scripts/video2note.mjs "<url>" --json
```

## 首次运行与模型缓存

第一次转写会下载模型（`large-v3-turbo` 约 1.6 GB），日志里是 HuggingFace 下载进度，之后复用本地缓存，不再联网。

- 下载源默认 `HF_ENDPOINT=https://hf-mirror.com`；想换官方源设 `HF_ENDPOINT=https://huggingface.co`。
- 缓存位置是 HuggingFace 默认目录（Windows `%USERPROFILE%\.cache\huggingface`，macOS `~/.cache/huggingface`），可用 `HF_HOME` 改到别的盘。
- 想清空间就删缓存目录里对应的模型文件夹；下次转写会重新下载。

## 装进 DSH（作为技能用）

不装插件也能用命令行。要让 agent 自动触发技能，把包登记到 DSH profile：

1. 在 profile 目录（`~/.dsh/profiles/<profile>/`）的 `package.json` 里加依赖与 bundle：

```json
{
  "dependencies": { "dsh-video-archive": "link:C:/path/to/dsh-video-archive" },
  "dsh": { "profile": { "bundles": ["dsh-video-archive"] } }
}
```

`dependencies` 让模块解析找得到，`dsh.profile.bundles` 让 `cordis.patch.yml` 被加载（技能目录由补丁里的 `bundledSkillDir` 指到包的 `skills/`）。

2. 在 profile 目录里装依赖：

```bash
pnpm install
```

3. 重启 DSH。会话里能看到 `video-archive` 技能后，`--doctor` 那步可以跳过——agent 每次跑都会先自检。

## 常见失败

| 现象 | 原因 | 处理 |
|---|---|---|
| `未找到 Microsoft Edge` | 没装或不在默认路径 | 装 Edge，或设 `VIDEO_ARCHIVE_EDGE` 指向 exe |
| `fasterWhisper: fail: ... No module named 'faster_whisper'` | `python` 不是装了库的那个 | 设 `VIDEO_ARCHIVE_PYTHON` |
| 转写报 `[engine] cuda/float16 failed` 后仍出结果 | 正常：`auto` 退到 CPU 了 | 想要更快就装 CUDA 运行库；不想等就换小模型 |
| `[engine] unavailable` | CPU 也起不来 | 确认`faster-whisper`和 `av` 装在同一解释器 |
| `no media stream` / `all candidates failed` | 没抓到音视频流 | 重跑一次；仍失败就是抓不到（登录态内容会这样） |
| 没有画面快照，文字正常 | ffmpeg 缺失或视频流太小 | 装 ffmpeg；确认 `ffmpeg -version` 正常 |
