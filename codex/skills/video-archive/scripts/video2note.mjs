#!/usr/bin/env node
// video2note — 抖音/视频链接 -> 分流(视频|图文) -> 转写/下载 -> 结构化笔记
// 用法: node video2note.mjs <url> [--out md] [--model large-v3-turbo] [--json] [--keep]
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const findEdge = () => [env.VIDEO_ARCHIVE_EDGE,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].filter(Boolean).find((p) => fs.existsSync(p));
const EDGE = findEdge();
const PY = env.VIDEO_ARCHIVE_PYTHON || 'python';
const ASR = path.join(HERE, 'transcribe.py');
const FFMPEG = env.VIDEO_ARCHIVE_FFMPEG || 'ffmpeg';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const VAULT = env.VIDEO_ARCHIVE_VAULT || process.cwd();
const NOTE_DIR = path.join(VAULT, env.VIDEO_ARCHIVE_SUBDIR || '03-外部资源', '短视频');
const ATTACH_DIR = path.join(VAULT, '_attachments', '短视频');

const argv = process.argv.slice(2);
const url = argv.find((a) => !a.startsWith('--'));
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def; };
const flag = (name) => argv.includes('--' + name);
const asJson = flag('json'), keepMedia = flag('keep');
const MODELS = ['tiny', 'base', 'small', 'medium', 'large-v2', 'large-v3', 'large-v3-turbo', 'distil-large-v3'];
const model = opt('model', env.VIDEO_ARCHIVE_MODEL || 'large-v3-turbo');
if (!MODELS.includes(model)) {
  console.error('unsupported model: ' + model + '\nsupported: ' + MODELS.join(', '));
  process.exit(2);
}
if (argv.includes('--doctor')) {
  const probe = (cmd, args) => { try { const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000 }); return r.status === 0 ? (String(r.stdout || '').trim().split('\n')[0] || 'ok') : 'fail: ' + String(r.stderr || '').slice(0, 80); } catch (e) { return 'fail: ' + e.message; } };
  const out = {
    vault: VAULT, vaultExists: fs.existsSync(VAULT), noteDir: NOTE_DIR,
    edge: EDGE || '(not found)',
    python: probe(PY, ['-c', 'import sys;print(sys.version.split()[0])']),
    ffmpeg: probe(FFMPEG, ['-version']),
    fasterWhisper: probe(PY, ['-c', 'import faster_whisper;print(faster_whisper.__version__)']),
    playwrightCore: (() => { try { return JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', '..', 'package.json'), 'utf8')).version ? 'ok' : 'ok'; } catch { return 'ok'; } })(),
    asrScript: fs.existsSync(ASR),
    asrModel: model,
    device: env.VIDEO_ARCHIVE_DEVICE || 'auto',
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.edge !== '(not found)' && out.asrScript ? 0 : 1);
}
if (!url) { console.error('usage: node video2note.mjs <url> [--out md] [--model m] [--json] [--keep] [--doctor]'); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2n-'));
const log = (...a) => { if (!asJson) console.error('[v2n]', ...a); };
const cleanup = () => { if (keepMedia) { log('keep', tmp); return; } try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} };
process.on('uncaughtException', (e) => { cleanup(); console.error('FATAL', e.message); process.exit(1); });

const slug = (s) => (s || '').replace(/[\\/:*?"<>|\n\r\t#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'untitled';

async function grab(pageUrl) {
  if (!EDGE) throw new Error('未找到 Microsoft Edge。安装 Edge 或用 VIDEO_ARCHIVE_EDGE 指定可执行文件路径。');
  const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--disable-blink-features=AutomationControlled', '--mute-audio'] });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'zh-CN', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const audio = new Set(), video = new Set(), imgs = new Set();
  page.on('response', (r) => {
    const u = r.url(), ct = (r.headers()['content-type'] || '');
    if (ct.startsWith('audio/') || /media-audio|\.m4a/.test(u)) audio.add(u);
    else if (ct.startsWith('video/') || /douyinvod|media-video|\.mp4/.test(u)) video.add(u);
    else if (ct.startsWith('image/') && /douyin|byteimg|aweme/.test(u)) imgs.add(u);
  });
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => { const v = document.querySelector('video'); if (v) { v.muted = true; v.play().catch(() => {}); } }).catch(() => {});
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => {
    const meta = (n) => document.querySelector('meta[property="' + n + '"],meta[name="' + n + '"]')?.content || '';
    const raw = [...document.querySelectorAll('img')].map((i) => ({ w: i.naturalWidth, h: i.naturalHeight, src: i.currentSrc || i.src }))
      .filter((x) => x.src && x.w >= 500 && x.w / x.h < 3 && x.h / x.w < 3);
    const domImgs = raw.filter((x) => /aweme-images/.test(x.src)).map((x) => x.src)
      .concat(raw.filter((x) => !/aweme-images/.test(x.src) && /douyinpic|douyin/.test(x.src) && !/avatar|sprite/.test(x.src)).map((x) => x.src));
    return { finalUrl: location.href, title: document.title, ogTitle: meta('og:title'),
      description: meta('description') || meta('og:description'), domImgs: [...new Set(domImgs)].slice(0, 12),
      hasVideo: !!document.querySelector('video') };
  });
  const cookies = (await ctx.cookies()).filter((c) => /douyin|xhs|xiaohongshu/.test(c.domain));
  await browser.close();
  return { ...info, audio: [...audio], video: [...video], imgs: [...new Set([...imgs, ...info.domImgs])], cookies };
}

async function fetchTo(url, dest, cookies, referer) {
  const ck = cookies.map((c) => c.name + '=' + c.value).join('; ');
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer || new URL(url).origin + '/', Cookie: ck } });
  if (!res.ok) throw new Error('http ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) throw new Error('too small ' + buf.length);
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function transcribeAudio(file) {
  const out = path.join(tmp, 'asr.json');
  try { fs.rmSync(out, { force: true }); } catch {}
  spawnSync(PY, [ASR, file, model, out], {
    encoding: 'utf8',
    env: { ...process.env, HF_ENDPOINT: env.HF_ENDPOINT || 'https://hf-mirror.com', ...(env.HF_HOME ? { HF_HOME: env.HF_HOME } : {}), HF_HUB_DISABLE_SYMLINKS_WARNING: '1', ASR_PROMPT: '', PYTHONIOENCODING: 'utf-8' },
    timeout: 15 * 60 * 1000,
  });
  if (!fs.existsSync(out)) throw new Error('no asr output');
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

async function makeFrames(videoUrl, cookies, durationSec, id, count = 4) {
  const vid = path.join(tmp, 'v.bin');
  await fetchTo(videoUrl, vid, cookies, 'https://www.douyin.com/');
  if (fs.statSync(vid).size < 300000) throw new Error('video too small ' + fs.statSync(vid).size);
  const dir = path.join(ATTACH_DIR, id);
  const out = [];
  const total = durationSec || 30;
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i++) {
    const t = ((i + 0.5) / count) * total;
    const f = path.join(dir, 'f' + (i + 1) + '.jpg');
    const r = spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(t.toFixed(1)), '-i', vid, '-frames:v', '1', '-vf', 'scale=640:-1', f], { timeout: 60000 });
    if (fs.existsSync(f) && fs.statSync(f).size > 1000) out.push(f);
    else log('  frame miss t=' + t.toFixed(1) + ' size=' + (fs.existsSync(vid) ? fs.statSync(vid).size : -1) + ' err=' + String(r.stderr || '').slice(0, 120));
  }
  if (!out.length && fs.existsSync(dir)) { try { fs.rmdirSync(dir); } catch {} }
  return out;
}

const t0 = Date.now();
log('grab', url);
const g = await grab(url);
const title = (g.ogTitle || g.title || '').replace(/\s*-\s*抖音\s*$/, '').replace(/#[^\s#]+/g, '').replace(/\s+/g, ' ').trim();
log('title:', title, '| audio', g.audio.length, 'video', g.video.length, 'imgs', g.imgs.length);

// ---- 分流 ----
const realVideo = g.video.some((u) => /douyinvod|media-video/.test(u));
const isGallery = /\/note\//.test(g.finalUrl) || (!realVideo && g.imgs.length >= 5);
const isVideo = !isGallery && (g.audio.length > 0 || realVideo);
log('branch:', isGallery ? 'gallery' : isVideo ? 'video' : 'unknown');
let asr = null, frames = [], savedImgs = [], mode = '';
const vid = (g.finalUrl.match(/\/(?:video|note)\/(\d+)/) || [])[1] || String(Date.now());

if (isVideo) {
  mode = 'video';
  const cands = [...g.audio, ...g.video];
  for (const c of cands.slice(0, 4)) {
    try {
      log('try audio:', c.slice(0, 70));
      const f = path.join(tmp, 'a.bin');
      await fetchTo(c, f, g.cookies, 'https://www.douyin.com/');
      asr = await transcribeAudio(f);
      break;
    } catch (e) { log('  failed:', String(e.message).slice(0, 90)); }
  }
  const vids = [...g.video.filter((u) => /douyinvod|media-video/.test(u)), ...g.video.filter((u) => !/douyinvod|media-video/.test(u))];
  if (asr && vids.length) {
    try {
      frames = await makeFrames(vids[0], g.cookies, Math.round(asr.duration), vid, 4);
      log('frames:', frames.length);
    } catch (e) { log('frames failed:', String(e.message).slice(0, 80)); }
  }
} else {
  mode = 'gallery';
  const dir = path.join(ATTACH_DIR, vid);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) { try { fs.rmSync(path.join(dir, f), { force: true }); } catch {} }
  const pool = g.imgs.filter((u) => /aweme-images/.test(u));
  const src = pool.length ? pool : g.imgs;
  const seen = new Set();
  const uniq = [];
  for (const u of src) { const k = (u.match(/tos-cn-i-dy\/([a-z0-9]+)~/) || u.match(/\/([a-f0-9]{20,})\./) || [])[1] || u.slice(0, 80); if (!seen.has(k)) { seen.add(k); uniq.push(u); } }
  for (const [i, u] of uniq.slice(0, 9).entries()) {
    try {
      const ext = /aweme-images|webp/.test(u) ? 'webp' : /png/.test(u) ? 'png' : 'jpg';
      const f = path.join(dir, 'p' + (savedImgs.length + 1) + '.' + ext);
      await fetchTo(u, f, g.cookies, 'https://www.douyin.com/');
      if (fs.statSync(f).size < 15000) { fs.rmSync(f, { force: true }); continue; }
      savedImgs.push(f);
    } catch {}
  }
  log('images saved:', savedImgs.length);
}

const rel = (p) => path.relative(VAULT, p).replace(/\\/g, '/');
const text = asr ? asr.text : (g.description || '');
const chars = text.length;
const tier = chars < 500 ? '轻量' : chars < 3000 ? '标准' : '深度';

// 同一链接复用旧笔记
let outPath = opt('out', '');
if (!outPath) {
  let reuse = null;
  if (fs.existsSync(NOTE_DIR)) for (const f of fs.readdirSync(NOTE_DIR)) {
    if (!f.endsWith('.md')) continue;
    const head = fs.readFileSync(path.join(NOTE_DIR, f), 'utf8').slice(0, 400);
    if (head.includes('final_url: ' + g.finalUrl)) { reuse = path.join(NOTE_DIR, f); break; }
  }
  const now = new Date();
  const date = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  outPath = reuse || path.join(NOTE_DIR, date + '-' + slug(title) + '.md');
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const parts = [
  '---',
  'source: ' + url,
  'final_url: ' + g.finalUrl,
  'type: ' + (mode === 'video' ? '视频' : '图文'),
  'captured: ' + new Date().toISOString(),
  'asr_model: ' + (asr ? model : 'none'),
  'duration_sec: ' + (asr ? Math.round(asr.duration) : 0),
  'tier: ' + tier,
  'tags: [外部资源, 短视频, ' + (mode === 'video' ? '转录' : '图文') + ']',
  '---',
  '',
  '# ' + title,
  '',
];
if (g.description) parts.push('> ' + g.description.trim() + '\n');
parts.push('## 分析总结', '', '<!-- ANALYSIS:START -->', '_（待补）_', '<!-- ANALYSIS:END -->', '');

if (frames.length) {
  parts.push('## 画面快照', '');
  for (const f of frames) parts.push('![' + path.basename(f) + '](' + rel(f) + ')', '');
}
if (savedImgs.length) {
  parts.push('## 原图', '');
  for (const f of savedImgs) parts.push('![' + path.basename(f) + '](' + rel(f) + ')', '');
}

if (asr) {
  parts.push('<details>', '<summary>原始转录（点击展开）</summary>', '', text, '', '</details>', '');
  if (tier !== '轻量') {
    parts.push('<details>', '<summary>带时间戳全文（点击展开）</summary>', '', ...asr.segments.map((s) => '- [' + s.start + '] ' + s.text), '', '</details>', '');
  }
}
parts.push('');

fs.writeFileSync(outPath, parts.join('\n'), 'utf8');
const result = { url, title, mode, tier, notePath: outPath, frames: frames.length, images: savedImgs.length,
  duration: asr ? Math.round(asr.duration) : 0, elapsedSec: Math.round((Date.now() - t0) / 1000), text };
if (asJson) console.log(JSON.stringify(result, null, 2));
else { console.log('note:', outPath); console.log('mode:', mode, '| tier:', tier, '| frames:', frames.length, '| imgs:', savedImgs.length); }
cleanup();
