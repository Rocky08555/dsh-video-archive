import os, sys, glob
_venv = os.path.dirname(os.path.dirname(os.path.abspath(sys.executable)))
for _d in glob.glob(os.path.join(_venv, "Lib", "site-packages", "nvidia", "*", "bin")):
    os.environ["PATH"] = _d + os.pathsep + os.environ.get("PATH", "")
    try:
        os.add_dll_directory(_d)
    except Exception:
        pass

import time, json, wave
import numpy as np
import av
from faster_whisper import WhisperModel

audio = sys.argv[1]
model_name = sys.argv[2] if len(sys.argv) > 2 else "small"
out_json = sys.argv[3] if len(sys.argv) > 3 else None
SR = 16000

def load_audio(path):
    if path.lower().endswith(".wav"):
        with wave.open(path, "rb") as w:
            raw = w.readframes(w.getnframes())
        return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    container = av.open(path)
    stream = container.streams.audio[0]
    resampler = av.AudioResampler(format="s16", layout="mono", rate=SR)
    chunks = []
    for frame in container.decode(stream):
        for rf in resampler.resample(frame):
            chunks.append(rf.to_ndarray().reshape(-1))
    if not chunks:
        raise RuntimeError("no audio decoded")
    return np.concatenate(chunks).astype(np.float32) / 32768.0

t0 = time.time()
data = load_audio(audio)
print(f"[audio] decoded {len(data)/SR:.1f}s in {time.time()-t0:.1f}s", flush=True)

want = os.environ.get("VIDEO_ARCHIVE_DEVICE", "auto").lower()
if want == "cpu":
    devices = [("cpu", "int8")]
elif want == "cuda":
    devices = [("cuda", "float16")]
else:
    devices = [("cuda", "float16"), ("cpu", "int8")]
model, used = None, None
for device, ct in devices:
    try:
        t0 = time.time()
        model = WhisperModel(model_name, device=device, compute_type=ct)
        used = f"{device}/{ct}"
        print(f"[engine] {used} loaded in {time.time()-t0:.1f}s", flush=True)
        break
    except Exception as e:
        print(f"[engine] {device}/{ct} failed: {type(e).__name__}: {str(e)[:160]}", flush=True)
if model is None:
    print("[engine] unavailable"); sys.exit(2)

t0 = time.time()
prompt = os.environ.get("ASR_PROMPT") or None
segments, info = model.transcribe(data, language="zh", vad_filter=True, beam_size=5, initial_prompt=prompt)
segs = [{"start": round(s.start, 1), "end": round(s.end, 1), "text": s.text.strip()} for s in segments]
text = "".join(s["text"] for s in segs)
print(f"[engine] {used} duration={len(data)/SR:.1f}s segments={len(segs)} took={time.time()-t0:.1f}s", flush=True)
print("---- TEXT ----")
print(text)
if out_json:
    json.dump({"audio": audio, "model": model_name, "engine": used, "duration": len(data)/SR, "segments": segs, "text": text},
              open(out_json, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
