# Lumen study-workflow audit — 15 November 2026

The library and sync have a working foundation. The full “upload recording → AI
transcript → AI study pack” workflow is **not connected in the hosted app**.
The fixes in this audit improve the actual available workflow without claiming
that a cloud AI service exists.

| Area | Current implementation | Verification and remaining limitation |
| --- | --- | --- |
| Browser lecture import | Caption file or pasted transcript, optional original PDF and Panopto link | Fixture tests cover timed/untimed imports, sparse IDs and malformed cues. Actual private university Panopto access is not tested or fetched by the app. |
| Original PDF slides | Local PDF.js renderer, account-scoped IndexedDB cache and authenticated private object storage | PDFs up to 20 MiB upload independently of library snapshots; offline uploads retry. Normal and suffix byte ranges are tested. A real two-page PDF rendered with text and graphics-only content using a Node canvas. Earlier imports discarded original bytes and require reattachment. Full browser/mobile and production authenticated upload checks remain outstanding. Image-only PDFs can display but are not OCR-transcribed. |
| Browser transcription | No recording transcription endpoint | Raw audio requires a future hosted transcription service, private object storage and durable jobs. |
| Mac transcription | MLX Whisper on Apple Silicon | Fixed bundled FFmpeg discovery, dense IDs after blank segments, no-speech failure, language detection/selection and serialized model runs. Boundary tests use a mocked model; a real local FastAPI fixture and the bundled FFmpeg executable also passed smoke checks. No real Mac or audio-accuracy benchmark was available. |
| Study generation | Extractive drafts in the browser; reusable tutor prompt plus source can be copied to an external assistant | Prompt requests concept synthesis, citations, worked examples, meaningful cards, quizzes and self-contained simulations. Prepared output can be saved; personal notes/resources are protected. OpenAI Platform rejected the authorized API-key creation request, so no key was saved and no automatic GPT generation has been connected or tested. Prompt quality does not establish generated-output quality. |
| Rich study content | Local Markdown engine and PDF renderer; app enhancements for quizzes/plots/widgets/math | Tested safe Markdown and rich-block structure. Plotly and math still load external browser libraries. Complete visual/device runtime testing remains outstanding. |
| Transcript correction | Searchable, paginated review, optional explicit outline/card rebuild | Validates segment IDs/time ranges. Preserves resources and notes; retained materials show a stale-source notice. |
| Search and connections | Includes caption text, slide text, generated materials, own notes and exact concept links | Regression tests cover discovery, correct concept matching and archived/code exclusion from the Universe. |
| Flashcards/quizzes | Flip cards and supplied quiz JSON | Cards support keyboard access. There is no spaced-repetition schedule, persistent grading record or adaptive tutor. |
| Sync | Account-isolated, local-first record sync with atomic hosted revisions | Existing two-client/SQLite tests continue to cover races, offline edits and conflict copies. Physical two-device sign-in was not exercised in this audit. |
| Undo/backups | Up to 30 device-local undo entries, bounded in size; manual backup export | Undo now stores changed-record preimages and trims optional history when storage fills. It is not synced revision history, a guaranteed recovery mechanism or a scheduled off-site backup. |
| SPSS | Ten standalone teaching lessons with local progress | All ten chapter functions render in a DOM stub. Main worked example recomputes to group means 11/9/7, SS between 40, SS within 36, F(2,12)=6.67 and p≈.011. Citations to the original lecture cannot be independently verified from the available repository. |
| SPSS placement | Standalone URL and sidebar shortcut | Keep it in place for now. Later add a Statistics → SPSS module and preserve the existing URL as a stable entry point. Progress should become account-scoped and synced as part of that migration. |
| Mac MCP | Separate local vault connector | Source exposes read/search/save tools, but it is not connected to the hosted D1 library. A hosted assistant cannot automatically read or save there through the local connector. The declared MCP 2.3 SDK source accepts its HTTP startup arguments; an older preinstalled SDK is not a valid compatibility test for that declaration. |

## Changes made in this audit

- Replaced the browser's partial regex renderer with a bundled Markdown engine;
  disabled raw HTML and preserved sandboxed rich-block handling.
- Added transcript/paste import, optional source URL, searchable caption review and
  a truthful source-to-assistant/prepared-material workflow.
- Corrected segment lookup, leading-slide assignment, stale/untimed playback
  links and malformed caption handling.
- Extended search and concept discovery to actual lecture learning content.
- Protected prepared materials, references and personal notes during caption edits.
- Reduced undo storage amplification and prevented optional history from blocking saves.
- Fixed SPSS navigation with invalid lesson parameters, corrupt progress and
  unavailable browser storage. Progress remains explicitly device-local.
- Improved local FFmpeg setup, no-speech errors, language selection, model-run
  serialization and empty-transcript realignment. Mac jobs remain in-memory and
  can be interrupted by closing/restarting the local server.

## Recommended next production increment

Build one durable cloud pipeline with private recording storage, resumable
uploads, a persistent job queue, authenticated transcription and generation calls,
source-linked output, focused transcript review, and targeted regeneration.
Reuse existing captions first; transcribe only when captions are unavailable.
Keep uploaded sources immutable and save versioned generated outputs separately
from personal notes. Add scheduled recovery-tested backups, monitoring and
real-device acceptance checks before treating the complete study pipeline as a
production service. A provider connection and its usage budget must be configured
before implementing or testing API-backed AI behavior. Private original PDF storage
is now implemented; recording uploads, durable jobs and GPT generation are not.
