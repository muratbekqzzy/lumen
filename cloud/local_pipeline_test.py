"""Exercise local pipeline boundaries; does not run Whisper or claim ASR accuracy."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lumen import transcribe

class LocalTranscriptionTest(unittest.TestCase):
    def test_bundled_ffmpeg_is_exposed_without_manual_shell_setup(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            executable = root / "bundled-ffmpeg"
            executable.write_text("#!/bin/sh\nexit 0\n")
            executable.chmod(0o755)
            with patch.object(transcribe, "ROOT", root), patch.object(transcribe.shutil, "which", return_value=None), patch.dict(sys.modules, {"imageio_ffmpeg": SimpleNamespace(get_ffmpeg_exe=lambda: str(executable))}), patch.dict(os.environ, {"PATH": "/usr/bin"}):
                transcribe._ensure_ffmpeg_on_path()
                self.assertEqual((root / "cache/ffmpeg-bin/ffmpeg").resolve(), executable)
                self.assertEqual(os.environ["PATH"].split(os.pathsep)[0], str(root / "cache/ffmpeg-bin"))
    def test_whisper_blank_segments_do_not_leave_broken_numeric_ids(self):
        result = {"language": "ar", "segments": [{"start": 0, "end": 1, "text": " "}, {"start": 1, "end": 3, "text": " Memory "}, {"start": 3, "end": 4, "text": ""}, {"start": 4, "end": 7, "text": " Retrieval "}]}
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "transcript.json"
            received = {}
            def model(*args, **kwargs):
                received.update(kwargs)
                return result
            with patch.object(transcribe, "_ensure_ffmpeg_on_path"), patch.dict(sys.modules, {"mlx_whisper": SimpleNamespace(transcribe=model)}):
                data = transcribe.transcribe(Path(temp) / "source.m4a", out)
            self.assertEqual([s["id"] for s in data["segments"]], [0, 1])
            self.assertIsNone(received["language"])
            self.assertEqual(json.loads(out.read_text())["language"], "ar")
    def test_empty_asr_output_fails_instead_of_claiming_a_finished_transcript(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(transcribe, "_ensure_ffmpeg_on_path"), patch.dict(sys.modules, {"mlx_whisper": SimpleNamespace(transcribe=lambda *a, **k: {"segments": []})}):
            out = Path(temp) / "transcript.json"
            with self.assertRaisesRegex(RuntimeError, "No speech"):
                transcribe.transcribe(Path(temp) / "silent.m4a", out)
            self.assertFalse(out.exists())
    def test_panopto_links_replace_start_without_breaking_other_parameters(self):
        # Load lecture helpers with filesystem/model dependencies stubbed, suitable for CI.
        import lumen
        fake_vault = SimpleNamespace()
        with patch.dict(sys.modules, {"pymupdf": SimpleNamespace(), "lumen.vault": fake_vault}), patch.object(lumen, "vault", fake_vault, create=True):
            path = Path(__file__).resolve().parents[1] / "lumen/lectures.py"
            spec = importlib.util.spec_from_file_location("lumen.lectures_audit", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        from urllib.parse import urlsplit, parse_qs
        link = module.panopto_link("https://school.panopto.com/view?start=9&id=abc#video", 21)
        parsed = urlsplit(link)
        self.assertEqual(parse_qs(parsed.query), {"id": ["abc"], "start": ["21"]})
        self.assertEqual(parsed.fragment, "video")
        self.assertEqual(module.panopto_link("javascript:alert(1)", 3), "")
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp); source = folder / "Source"; source.mkdir()
            (source / "transcript.json").write_text('{"segments": []}')
            module.vault = SimpleNamespace(resolve=lambda _: folder, read_meta=lambda _: {"title": "Silent"}, commit_now=lambda _: None)
            module.realign("lecture")
            self.assertEqual(json.loads((source / "alignment.json").read_text())["chunks"][0]["end"], 0)

if __name__ == "__main__":
    unittest.main()
