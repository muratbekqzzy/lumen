import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).resolve().parents[1] / "tools" / "panopto_from_link.py"
spec = importlib.util.spec_from_file_location("panopto_import", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PanoptoImportTest(unittest.TestCase):
    def test_parse_srt_captions(self):
        raw = "1\n00:00:01,000 --> 00:00:03,500\nThe hippocampus is important.\n\n2\n00:00:05,000 --> 00:00:08,000\nMemory and attention.\n"
        got = module.parse_captions(raw)
        self.assertEqual(len(got), 2)
        self.assertEqual(got[0]["start"], 1)
        self.assertEqual(got[0]["end"], 3.5)
    def test_duplicate_caption_lines_are_not_duplicated(self):
        raw = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nWorking memory.\n\n00:00:02.000 --> 00:00:03.000\nWorking memory.\n"
        got = module.parse_captions(raw)
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]["end"], 3)
    def test_import_preserves_timed_segments_and_marks_slides_as_estimates(self):
        captions = [{"id":0,"start":0,"end":6,"text":"Encoding"}]
        data = module.build("Psychology","https://school.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=x",captions,[{"page":1,"title":"Encoding","text":"Encoding and memory"}],"en.vtt")
        lecture = next(iter(data["records"].values()))
        self.assertTrue(lecture["alignment_estimated"])
        self.assertEqual(lecture["segments"], captions)
        self.assertEqual(lecture["source"], "panopto-captions")

if __name__ == "__main__":
    unittest.main()
