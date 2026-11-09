# 在 Codex 里用 video-archive

Codex 版和 DSH（DeepSeek Harness）版共用同一套脚本，差别只在"谁发现这个技能"：

| | DSH 版 | Codex 版 |
|---|---|---|
| 位置 | `skills/video-archive/` | `codex/skills/video-archive/` |
| 发现方式 | `package.json` + `cordis.patch.yml` 插件挂载 | Codex 自己扫 `$CODEX_HOME/skills`（默认 `~/.codex/skills`） |
| 入口 | 工具调用 | `SKILL.md` 的 description 命中后由 Codex 读取正文照做 |
| 脚本 | `scripts/video2note.mjs` + `transcribe.py` | 同一份代码，只改了注释和 usage 文案 |

Codex 的技能约定：一个技能一个目录，目录名即技能名，目录里有 `SKILL.md`（frontmatter 至少 `name` + `description`），辅助脚本放同目录的 `scripts/` 下。不需要 README、不需要 package.json。

---

## 1. 前提

| 依赖 | 版本/说明 | 检查 |
|---|---|---|
| Node.js | 22.19+ 或 24+ | `node --version` |
| Microsoft Edge | 任一近期版本（抓流用，无头启动） | 装好即可，脚本会自动找 |
| Python 3 | 装有 `faster-whisper`（含 `numpy`、`av`） | `python -c "import faster_whisper" ` |
| ffmpeg | 任一近期版本 | `ffmpeg -version` |
| playwright-core | Node 包，只驱动本机 Edge，不下载浏览器 | 见下面安装步骤 |
| GPU（可选） | 有 CUDA 就走 GPU，没有回退 CPU | 转写速度差异明显 |

转写全在本机跑，**不需要任何 API key**。首次转写会下载 `large-v3-turbo` 模型，约 1.6GB（走 `HF_ENDPOINT` 指定的镜像，脚本默认 `https://hf-mirror.com`）。

---

## 2. 安装

### 方式 A：直接用仓库里的 Codex 技能目录

在仓库根装一次依赖（生成 `node_modules`），脚本就能正常解析 `playwright-core`：

```bash
git clone https://github.com/Rocky08555/dsh-video-archive.git
cd dsh-video-archive
npm install                      # 拉 playwright-core
node codex/skills/video-archive/scripts/video2note.mjs --doctor
```

适合先试、或在项目里用相对路径调用。

### 方式 B：装进 Codex 的技能目录（推荐日常使用）

Codex 默认只在 `$CODEX_HOME/skills` 里找技能，`CODEX_HOME` 没设时就是 `~/.codex/skills`。把目录拷进去：

```powershell
# Windows PowerShell
$dst = "$env:USERPROFILE\.codex\skills\video-archive"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item .\codex\skills\video-archive\SKILL.md $dst -Force
Copy-Item .\codex\skills\video-archive\scripts $dst -Recurse -Force
```

```bash
# macOS / Linux
mkdir -p ~/.codex/skills/video-archive
cp -r codex/skills/video-archive/SKILL.md codex/skills/video-archive/scripts ~/.codex/skills/video-archive/
```

拷进去以后还要让 Node 能解析 `playwright-core`：Node 会从脚本所在目录逐级往上找 `node_modules`，所以在技能目录里准备一份即可。

```powershell
# 有网：在技能目录里装
cd $env:USERPROFILE\.codex\skills\video-archive
npm install playwright-core
```

```powershell
# 没网/想复用已有 checkout：直接把包拷过去（实测可用）
$dst = "$env:USERPROFILE\.codex\skills\video-archive\node_modules"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item .\node_modules\playwright-core $dst -Recurse -Force
```

装好后目录长这样：

```text
%USERPROFILE%\.codex\skills\video-archive\
├── SKILL.md
├── node_modules\playwright-core\      （必备，否则脚本起不来）
└── scripts\
    ├── video2note.mjs
    └── transcribe.py
```

> 少这一步会直接报 `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'playwright-core'`，`--doctor` 也跑不起来，因为 `import` 发生在任何逻辑之前。

---

## 3. 配置环境变量

都有默认值，至少设 `VIDEO_ARCHIVE_VAULT`（否则笔记会落到当前工作目录）。

| 变量 | 默认 | 作用 |
|---|---|---|
| `VIDEO_ARCHIVE_VAULT` | 当前工作目录 | 知识库根，笔记与附件都落在这下面 |
| `VIDEO_ARCHIVE_SUBDIR` | `03-外部资源` | 笔记写到 `<vault>/<subdir>/短视频/` |
| `VIDEO_ARCHIVE_EDGE` | 自动找 Edge | Edge 可执行文件路径 |
| `VIDEO_ARCHIVE_PYTHON` | `python` | 装了 faster-whisper 的解释器（venv 时填绝对路径） |
| `VIDEO_ARCHIVE_FFMPEG` | `ffmpeg` | 抽帧用 |
| `VIDEO_ARCHIVE_MODEL` | `large-v3-turbo` | 转写模型，合法值只有 `tiny` / `base` / `small` / `medium` / `large-v2` / `large-v3` / `large-v3-turbo` / `distil-large-v3`；非法值退出码 2，不回落默认 |
| `VIDEO_ARCHIVE_DEVICE` | `auto` | `auto`：先 cuda/float16，失败退 cpu/int8；`cpu`：只 cpu/int8；`cuda`：只 cuda/float16，无可用 CUDA 直接报错不回退 |
| `HF_ENDPOINT` | 脚本内 `https://hf-mirror.com` | 模型下载源 |

永久设置（Windows，写进用户环境变量，重开终端生效）：

```powershell
[Environment]::SetEnvironmentVariable('VIDEO_ARCHIVE_VAULT', 'E:\你的知识库', 'User')
[Environment]::SetEnvironmentVariable('VIDEO_ARCHIVE_PYTHON', "$env:USERPROFILE\.venvs\asr\Scripts\python.exe", 'User')
```

macOS / Linux（写进 `~/.zshrc` 或 `~/.bashrc`）：

```bash
export VIDEO_ARCHIVE_VAULT="$HOME/notes"
export VIDEO_ARCHIVE_PYTHON="$HOME/.venvs/asr/bin/python"
```

只对当前终端有效：

```powershell
$env:VIDEO_ARCHIVE_VAULT = 'E:\你的知识库'
```

---

## 4. 验证：--doctor

```powershell
node "$env:USERPROFILE\.codex\skills\video-archive\scripts\video2note.mjs" --doctor
```

正常输出（路径是你自己的，这里只是形状）：

```json
{
  "vault": "E:\\notes",
  "vaultExists": true,
  "noteDir": "E:\\notes\\03-外部资源\\短视频",
  "edge": "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "python": "3.12.10",
  "ffmpeg": "ffmpeg version 9.0.2-essentials_build-www.gyan.dev ...",
  "fasterWhisper": "1.2.1",
  "playwrightCore": "ok",
  "asrScript": true,
  "asrModel": "large-v3-turbo",
  "device": "auto"
}
```

- 退出码 `0` 表示 `edge` 找到了、`asrScript` 存在；非 0 就按下面的排错表处理。
- `python`/`ffmpeg`/`fasterWhisper` 显示 `fail: ...` 时**不影响退出码**，但真跑起来会失败或退回 CPU —— 这三项必须绿。
- doctor 只做探测，不下载模型、不联网抓视频。

对照：本仓库里两条路径都跑过 `node --check`，Codex 版 `--doctor` 在 Windows + Edge + Python 3.12 + faster-whisper 1.2.1 + ffmpeg 9.0.2 + Node 24 上返回全绿、退出码 0。

---

## 5. 在 Codex 会话里用

1. 把 `codex/AGENTS.md` 复制成你知识库根目录的 `AGENTS.md`（Codex 每次会话会读项目根的 `AGENTS.md`），里面写清了触发条件、笔记路径和收尾要求。
2. 直接把抖音链接/分享口令丢给 Codex，说"看看这个视频/转成笔记"。描述命中 `SKILL.md` 里的 description，Codex 会自己读技能正文。
3. 也可以显式说"用 video-archive 技能存这条"。

产出：

- 笔记：`<vault>/03-外部资源/短视频/<日期>-<标题>.md`，含分析占位区、画面快照（视频 4 张）、原图（图文最多 9 张）、可折叠的原始转录。
- 附件：`<vault>/_attachments/短视频/<视频id>/`。
- 下载的视频/音频放在系统临时目录，跑完即删（`--keep` 才会留）。

同一链接重跑会复用已有笔记文件，不会生成第二份。

---

## 6. 排错

| 现象 | 原因 / 处理 |
|---|---|
| `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright-core'` | 技能目录下没有 `node_modules/playwright-core`，按"方式 B"补上 |
| `edge: "(not found)"` | 没装 Edge；或设 `VIDEO_ARCHIVE_EDGE` 指向 `msedge.exe` |
| `fasterWhisper: "fail: ... ModuleNotFoundError"` | 当前 `python` 不是装 faster-whisper 的那个；用 `VIDEO_ARCHIVE_PYTHON` 指到 venv 里的解释器 |
| `ffmpeg: "fail: ..."` | ffmpeg 不在 PATH，或设 `VIDEO_ARCHIVE_FFMPEG` |
| `vaultExists: false` | `VIDEO_ARCHIVE_VAULT` 写错了，或目录还没建 |
| 第一次跑特别慢 | 在下 1.6GB 模型；只发生一次。慢就先换 `HF_ENDPOINT` 镜像 |
| `no media stream` / `all candidates failed` | 抓流失败，重跑一次；仍失败就是页面结构或风控问题，如实报告 |
| 需要登录的内容抓不到 | 脚本用干净浏览器、无登录态，这是设计如此 |
| 转写乱码/夹英文 | 中文口语 + 术语常见错，笔记阶段人工修正；也可 `--model medium` 重试 |
| 小红书链接失败 | 本技能只验证过抖音，小红书未验证 |

---

## 7. 升级 / 卸载

升级：重新拷 `codex/skills/video-archive/` 的 `SKILL.md` 与 `scripts/` 覆盖过去（`node_modules` 不用重拷）；换了 Node 或想升 `playwright-core` 时在技能目录里再 `npm install playwright-core`。

卸载：删掉 `~/.codex/skills/video-archive` 整个目录即可，Codex 下次会话就不再发现它。已经生成的笔记和附件不受影响。
