# dsh-video-archive

Turn a Douyin video or image-post link into a structured Obsidian note. A local Edge instance fetches the page and media, faster-whisper transcribes on your own GPU/CPU. No API key, nothing leaves the machine.

## What it does

| Case | Behavior | Status |
|---|---|---|
| Douyin video | grab audio → local transcription → 4 snapshots + collapsible transcript | verified |
| Douyin image post | description + up to 9 original images | verified |
| Xiaohongshu | same fetch/transcribe path | untested |
| Bilibili / YouTube | out of scope, use a dedicated plugin | not recommended |

- Note tier by text length: `light` < 500 chars, `standard` < 3000, `deep` ≥ 3000. The last two also get a timestamped transcript.
- No video kept on disk: 4 snapshots (640 px wide) for video, up to 9 images for posts. Temporary media is deleted on exit (`--keep` keeps it).
- Re-running the same `final_url` reuses the existing note file.

## Quick start

Prerequisites: Node 22.19+ / 24+, Microsoft Edge, Python 3.10+ with `faster-whisper`, ffmpeg. See [docs/install.md](docs/install.md).

```bash
git clone https://github.com/Rocky08555/dsh-video-archive
cd dsh-video-archive
npm install
node skills/video-archive/scripts/video2note.mjs --doctor
VIDEO_ARCHIVE_VAULT=/path/to/vault node skills/video-archive/scripts/video2note.mjs "https://v.douyin.com/xxxxx/" --json
```

Notes land in `<vault>/03-外部资源/短视频/`, attachments in `<vault>/_attachments/短视频/<video-id>/`.

> `npm install` needs network access. Offline or reusing an existing checkout: copy `node_modules/playwright-core` into the repo root (see `docs/codex.md`).

As a skill: install the package into DSH (see [docs/install.md](docs/install.md)), then give the agent a link and say "archive it with video-archive".

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `VIDEO_ARCHIVE_VAULT` | cwd | vault root |
| `VIDEO_ARCHIVE_SUBDIR` | `03-外部资源` | notes go to `<subdir>/短视频/` |
| `VIDEO_ARCHIVE_EDGE` | auto-detected | browser executable |
| `VIDEO_ARCHIVE_PYTHON` | `python` | interpreter with `faster-whisper` |
| `VIDEO_ARCHIVE_FFMPEG` | `ffmpeg` | frame extraction |
| `VIDEO_ARCHIVE_MODEL` | `large-v3-turbo` | one of `tiny`, `base`, `small`, `medium`, `large-v2`, `large-v3`, `large-v3-turbo`, `distil-large-v3`; anything else exits with code 2 and prints the list |
| `VIDEO_ARCHIVE_DEVICE` | `auto` | `auto` tries CUDA then falls back to CPU; `cpu` CPU-only; `cuda` GPU-only, errors out instead of falling back |
| `HF_ENDPOINT` | `https://hf-mirror.com` | model download endpoint |

`--model` overrides `VIDEO_ARCHIVE_MODEL`, which overrides the default.

## CLI

```
node skills/video-archive/scripts/video2note.mjs <url> [--doctor] [--json] [--out <md>] [--model <name>] [--keep]
```

## Known limits

- Desktop only: a real Edge/Chrome is required.
- First run downloads the whisper model (~1.6 GB).
- Bigger models are more accurate and slower. On GPU a 5-minute video costs roughly 1 extra minute with `small`, ~20 s with `large-v3-turbo`. Set `VIDEO_ARCHIVE_DEVICE=cpu` when VRAM is short.
- ASR output contains errors on names, model numbers and jargon; correct the analysis section against the frames.
- Login-gated content fails: the browser instance is clean, with no cookies.

## Docs

- [docs/install.md](docs/install.md) — Windows/macOS setup, `--doctor`, model and device tuning
- [docs/wechat.md](docs/wechat.md) — send a link from WeChat on your phone and get a note in Obsidian (DSH IM integration + this skill, not a feature of this package)

## License

MIT © Rocky08555
