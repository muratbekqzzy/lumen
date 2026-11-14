"""Local lecture transcription with Whisper (Apple Silicon, via MLX).

Nothing leaves the Mac: audio is decoded with the bundled ffmpeg and
transcribed with an on-device Whisper model.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL = os.environ.get("LUMEN_WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo")


def _ensure_ffmpeg_on_path() -> None:
    bin_dir = str(ROOT / "bin")
    if bin_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")


def transcribe(audio: Path, out_json: Path, vocabulary: str = "", language: str | None = "en") -> dict:
    """Transcribe `audio` and write segments (with timestamps) to `out_json`."""
    _ensure_ffmpeg_on_path()
    import mlx_whisper  # imported lazily: heavy

    t0 = time.time()
    prompt = f"University lecture. Key terms: {vocabulary}." if vocabulary else None
    result = mlx_whisper.transcribe(
        str(audio),
        path_or_hf_repo=MODEL,
        language=language,
        initial_prompt=prompt,
        condition_on_previous_text=False,  # avoids repetition loops on long audio
        verbose=None,
    )
    segments = [
        {"id": i, "start": round(s["start"], 2), "end": round(s["end"], 2), "text": s["text"].strip()}
        for i, s in enumerate(result.get("segments", []))
        if s["text"].strip()
    ]
    data = {
        "model": MODEL,
        "language": result.get("language", language),
        "seconds_to_transcribe": round(time.time() - t0, 1),
        "segments": segments,
    }
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(data, indent=1, ensure_ascii=False))
    return data


if __name__ == "__main__":
    # usage: python -m lumen.transcribe AUDIO OUT.json ["vocabulary, terms"]
    a, o = Path(sys.argv[1]), Path(sys.argv[2])
    vocab = sys.argv[3] if len(sys.argv) > 3 else ""
    d = transcribe(a, o, vocab)
    print(f"{len(d['segments'])} segments in {d['seconds_to_transcribe']}s")
