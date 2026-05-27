# hydro_scratch

hydro的手动测评及出题插件。

## Features

- Create a normal Hydro problem tagged as `Scratch`, so it appears in the standard problem set.
- Open Scratch problems directly in an embedded online Scratch editor.
- Load a teacher-uploaded `.sb3` template or the student's latest draft.
- Save drafts from the editor.
- Submit `.sb3` projects from the editor.
- Store submissions as Hydro records with a downloadable code attachment.
- Preview, download, list, and manually score Scratch submissions.
- Keep Hydro model calls behind `src/hydro-api.ts`, making future Hydro API changes easier to patch.
- Bundle a Scratch GUI build plus Scratch library assets for offline/self-hosted deployments.
- Serve Scratch library assets through `/scratch-assets`, with remote fallback for missing assets.

## Install

```bash
npm install
npm run build
hydrooj addon add E:/Users/moran/Documents/hydro_chajian
```

Then restart Hydro.

## Package

```bash
npm run pack:plugin
```

The package is written to `release/`.

## Routes

```text
GET  /scratch/problem/create
GET  /scratch/problem/:pid/edit
GET  /scratch/problem/:pid/config
POST /scratch/problem/:pid/config
GET  /scratch/problem/:pid/editor
GET  /scratch/problem/:pid/submissions
GET  /scratch/problem/:pid/draft
POST /scratch/problem/:pid/draft
GET  /scratch/problem/:pid/draft/project
POST /scratch/submit/:pid
GET  /scratch/submission/:rid/preview
GET  /scratch/submission/:rid/project
GET  /scratch/submission/:rid/score
POST /scratch/submission/:rid/score
```

## Notes

- New Scratch problems default to online-editor submission mode.
- Visiting `/p/:pid` keeps the normal Hydro problem page and adds a Scratch online editor link to the statement.
- Teachers can score from `Scratch Problem -> Submissions -> Preview / Score` or directly from `/scratch/submission/:rid/preview`.
- Teachers can use the direct scoring page `/scratch/submission/:rid/score` when they need a separate manual scoring entry.
- Students can open `Scratch Problem -> My Submissions` to view previous Scratch projects, downloads, previews, and Hydro record links.
- Contest/homework entries preserve `tid` when launched from the Hydro problem page, so manual scoring updates the corresponding scoreboard status.
- The preview page uses the bundled Scratch editor and reads the submitted `.sb3` from the same Hydro origin, avoiding external-player fetch/CORS failures.
- Submitted projects are saved under Hydro's standard `submission/` storage prefix so record detail pages can download the `.sb3` attachment.
