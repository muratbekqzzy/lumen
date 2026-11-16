# One file, one complete lecture

Choose **Import Markdown** in the sidebar, or inside the lecture/module you want.
Select or drop one `.md` or `.markdown` file. Lumen fills the destination from the
header, shows whether it will create or update a lecture, and saves when you press
**Import lecture** or **Update lecture**. Slides and transcripts are not required.

**Get a template** downloads a ready starting file. From an existing lecture, its
template includes stable destination IDs so later renames do not break placement.
Without a header, choose the destination in the importer; the current lecture or
module supplies the starting context. Ambiguous names must be resolved explicitly.

```markdown
---
lumen: 1
section: Neuropsychology
module: PSYC 1142
lecture: Lecture 01 - Experimental Research Proposal
category: academic
---

# Experimental research

## Understand the idea
A concise explanation, with a worked example and important distinctions.

## Apply it
Include useful diagrams, images or an interactive example.

# Slide explanations

## Slide 1 - The research question
The prepared explanation of this slide.

## Slide 2 - Designing a comparison
The prepared explanation of the next slide.
```

The header uses flat text fields. Quote values containing unusual punctuation if
needed. `section_id`, `module_id` and `lecture_id` are optional stable references
supplied by contextual templates. A module shorthand such as `PSYC 1142` resolves
its unique full course title. Lecture numbers resolve within that module. Missing
sections/modules can be created during import. Categories are `academic`,
`professional`, `creative` and `language`.

The main body is the complete **Lecture** view. Use ordinary Markdown headings,
lists, tables, links and images. Inline maths uses `$...$`; display maths uses
`$$...$$`. Important concepts can use `[[Concept name]]` links.

Interactive material uses fenced blocks:

- `plotly`: valid JSON with `data`, optional `layout` and `caption`.
- `widget`: self-contained HTML, CSS and JavaScript, with an optional
  `<!-- height: 520 -->` comment. It runs in an isolated iframe; no parent access,
  network requests, external scripts or storage. SVG and Canvas work inside it.
- `quiz`: JSON with `title` and `questions`; each question has `q`, string `options`,
  a zero-based numeric `answer`, and optional `why`.
- `qa`: JSON such as `{"q":"Why use a control group?","a":"To provide a comparison."}`
  for a simple answer reveal. **Add a question** on the lecture page creates these manually.

Optional **Slide explanations** map `## Slide N` headings to PDF page numbers.
They work without a PDF; attach original slides later through **Slides → Add
slides**. A supplied **Practice questions** or **Flashcards** section becomes a
collapsed practice area. No practice cards are generated automatically, and old
flashcard sets are not appended to the reader.

An update replaces the imported reading material and prepared slide/practice
content. It keeps personal notes, original PDF references, captions and other
stored resources. Undo can restore the previous import on the importing device;
keep independent backups of important work. Same-file imports are idempotent.

Files must be UTF-8 and at most 1 MiB; the synced library currently has an 8 MiB
limit. Changes save locally and sync while Lumen is open online. Sign in with the
same account on each device. Initial Plotly/math loading and remote images still
need internet access; the Markdown renderer and PDF reader are bundled locally.
Lumen formats and organises the prepared content; it does not rewrite or fact-check
it, generate additional cards, or call an AI service.
