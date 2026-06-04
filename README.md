# hydro_scratch

hydro的手动测评及出题插件。

## Features

- Create a normal Hydro problem tagged as `Scratch`, so it appears in the standard problem set.
- Open Scratch problems directly in an embedded online Scratch editor.
- Load a teacher-uploaded `.sb3` template or the student's latest draft.
- Save drafts from the editor.
- Submit `.sb3` projects from the editor.
- Store submissions as Hydro records with a downloadable code attachment.
- Preview, download, list, manually score, and auto-judge Scratch submissions.
- Review all pending manual Scratch submissions in a domain from one queue, with optional problem filtering.
- Configure static checks, structure checks, and dynamic checks through `judgeConfig`.
- Limit required blocks to a target sprite and script order with `structureChecks`.
- Run Scratch VM checks for variables and sprite positions with `dynamicChecks`.
- Save automatic judge details on submissions and show test point results on preview/scoring pages.
- Import and export Hydro-native Scratch problem packages as `.zip` files.
- Package a problem statement, auto-judge config, Scratch settings, and optional `.sb3` template together for reuse.
- Keep Hydro model calls behind `src/hydro-api.ts`, making future Hydro API changes easier to patch.
- Bundle a Scratch GUI build plus Scratch library assets for offline/self-hosted deployments.
- Serve Scratch library assets through `/scratch-assets`, with remote fallback for missing assets.
- Let system administrators limit the plugin to selected Hydro domains without changing existing Scratch problem data.

## Install

```bash
npm install
npm run build
hydrooj addon add E:/Users/moran/Documents/hydro_chajian
```

Then restart Hydro.

## Domain Scope

System administrators can limit where the plugin is active through the plugin configuration:

```yaml
enabledDomains:
  - scratch
  - classroom
```

- Use the domain ID from the URL, such as `scratch` in `/d/scratch/`, rather than the displayed domain name.
- An empty or missing `enabledDomains` list keeps the previous behavior and enables the plugin in every domain.
- Domain IDs are trimmed and compared case-insensitively.
- In a disabled domain, the `Scratch Problem` creation entry, problem-page Scratch actions, editor, draft, submit, preview, scoring, import, export, and guide routes are unavailable.
- Existing Scratch problems, submissions, drafts, and stored files are not deleted when a domain is removed from the list.
- `/scratch-assets` remains globally available because it is shared static editor infrastructure.

Administrator guide: `docs/scratch-domain-scope-0.6.8.md`

Manual review guide: `docs/scratch-manual-review-0.6.9.md`

## Package

```bash
npm run pack:plugin
```

The package is written to `release/`.

## Routes

```text
GET  /scratch/problem/create
GET  /scratch/problem/import
POST /scratch/problem/import
GET  /scratch/problem/:pid/edit
GET  /scratch/problem/:pid/config
POST /scratch/problem/:pid/config
GET  /scratch/problem/:pid/export
GET  /scratch/problem/:pid/editor
GET  /scratch/problem/:pid/submissions
GET  /scratch/review
GET  /scratch/problem/:pid/draft
POST /scratch/problem/:pid/draft
GET  /scratch/problem/:pid/draft/project
POST /scratch/submit/:pid
GET  /scratch/submission/:rid/preview
GET  /scratch/submission/:rid/project
GET  /scratch/submission/:rid/report
GET  /scratch/submission/:rid/score
POST /scratch/submission/:rid/score
```

## Notes

- New Scratch problems default to online-editor submission mode.
- Visiting `/p/:pid` keeps the normal Hydro problem page and adds a Scratch online editor link to the statement.
- Teachers can score from `Scratch Problem -> Submissions -> Preview / Score` or directly from `/scratch/submission/:rid/preview`.
- Teachers can use the direct scoring page `/scratch/submission/:rid/score` when they need a separate manual scoring entry.
- Teachers can open `/scratch/review` to see pending manual Scratch submissions across the current domain, then filter by problem, contest/homework name, source, or scoring state.
- New manual-only submissions use Hydro's Waiting status, so they also appear in Hydro's native pending record filter.
- Students can open `Scratch Problem -> My Submissions` to view previous Scratch projects, downloads, previews, and Hydro record links.
- Contest/homework entries preserve `tid` when launched from the Hydro problem page, so manual scoring updates the corresponding scoreboard status.
- Static mode runs configured static and structure checks immediately after submit and writes the score back to Hydro records.
- Dynamic mode runs configured VM checks such as variable values and sprite positions.
- Hybrid mode combines static, structure, and dynamic checks while keeping the teacher scoring page available for review or override.
- Teachers can export a Scratch problem as a Hydro-native package and import it into another Hydro site through `/scratch/problem/import`.
- The preview page uses the bundled Scratch editor and reads the submitted `.sb3` from the same Hydro origin, avoiding external-player fetch/CORS failures.
- Submitted projects are saved under Hydro's standard `submission/` storage prefix so record detail pages can download the `.sb3` attachment.

## Hydro-Native Problem Package

The package format is a `.zip` file that can be created by the plugin export page or assembled manually:

```text
problem.yaml
statement.md
scratch-judge.json
template.sb3          # optional
```

Use `/scratch/problem/import` to create a normal Hydro problem with Scratch settings and auto-judge tests already attached. Use `/scratch/problem/:pid/export` from the Scratch problem settings page to download the same format.

Teacher-facing package guide:

- `docs/hydro-native-problem-package.md`
- `docs/templates/problem-package/problem.yaml`
- `docs/templates/problem-package/statement.md`
- `docs/templates/problem-package/scratch-judge.json`

## Auto Judge Config

Set the problem judge mode to `Static`, `Dynamic`, or `Hybrid`, then paste a JSON config in the Scratch settings page. Static mode runs `staticChecks` and `structureChecks`; Dynamic mode runs `dynamicChecks`; Hybrid mode runs all configured checks.

Teacher-facing configuration guide:

- `docs/teacher-judge-config-guide.md`
- `docs/templates/judge-config-hybrid-position.json`
- `docs/templates/judge-config-keypress-variable.json`
- `docs/templates/judge-config-static-structure-only.json`

```json
{
  "totalScore": 100,
  "staticChecks": [
    {
      "name": "存在 Player 角色",
      "type": "sprite_exists",
      "sprite": "Player",
      "score": 50
    },
    {
      "name": "点击绿旗",
      "type": "block_exists",
      "opcode": "event_whenflagclicked",
      "score": 50
    }
  ]
}
```

Hybrid example with target script order and final sprite position:

```json
{
  "schemaVersion": 2,
  "totalScore": 100,
  "staticChecks": [
    {
      "name": "Player sprite exists",
      "type": "sprite_exists",
      "sprite": "Player",
      "score": 10
    }
  ],
  "structureChecks": [
    {
      "name": "Player green flag script has the expected order",
      "type": "script_sequence",
      "target": "Player",
      "hat": "event_whenflagclicked",
      "sequence": ["event_whenflagclicked", "motion_gotoxy", "motion_movesteps"],
      "score": 30
    }
  ],
  "dynamicChecks": [
    {
      "name": "Player reaches target position",
      "type": "sprite_position",
      "target": "Player",
      "expected": { "x": 100, "y": 0 },
      "tolerance": 5,
      "score": 60,
      "steps": [
        { "action": "green_flag" },
        { "action": "wait", "ms": 800 }
      ]
    }
  ],
  "dynamicOptions": {
    "timeoutMs": 5000,
    "positionTolerance": 5
  }
}
```
