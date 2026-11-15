"""Local lecture transcription with Whisper (Apple Silicon, via MLX).

Nothing leaves the Mac: audio is decoded with the bundled ffmpeg and
transcribed with an on-device Whisper model.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL = os.environ.get("LUMEN_WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo")


def _ensure_ffmpeg_on_path() -> None:
    """Use system ffmpeg, or expose the bundled executable to Whisper's subprocess."""
    if shutil.which("ffmpeg"):
        return
    try:
        import imageio_ffmpeg
        executable = Path(imageio_ffmpeg.get_ffmpeg_exe()).resolve()
    except (ImportError, RuntimeError) as exc:
        raise RuntimeError("FFmpeg is unavailable. Install Lumen's Python dependencies before transcribing.") from exc
    if not executable.is_file() or not os.access(executable, os.X_OK):
        raise RuntimeError("The bundled FFmpeg executable is unavailable or cannot run.")
    bin_dir = ROOT / "cache" / "ffmpeg-bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    link = bin_dir / "ffmpeg"
    if link.is_symlink() and link.resolve() != executable:
        link.unlink()
    if not link.exists():
        link.symlink_to(executable)
    if not os.access(link, os.X_OK):
        raise RuntimeError("Lumen's FFmpeg launcher is not executable.")
    os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")


def transcribe(audio: Path, out_json: Path, vocabulary: str = "", language: str | None = None) -> dict:
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
        for i, s in enumerate(s for s in result.get("segments", []) if s.get("text", "").strip())
    ]
    if not segments:
        raise RuntimeError("No speech was detected. Check the recording and language before trying again.")
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
