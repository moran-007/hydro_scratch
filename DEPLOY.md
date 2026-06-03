# Production Deploy

This plugin is packaged as:

```text
release/hydro-plugin-scratch-0.6.5.tgz
```

For an existing installation, use the delta update package instead:

```text
release/hydro-plugin-scratch-update-0.6.5.tgz
```

The delta package contains plugin code, templates, docs, scripts, and the modified Scratch editor `index.html` / `gui.js`. It does not include the unchanged Scratch asset library.

Deploy it on the production server as the same Linux user that runs Hydro.

Version `0.6.5` moves Scratch OJ controls into the embedded editor: fullscreen replaces the Tutorials slot, settings live in the Scratch Settings menu, the problem panel is draggable, and the latest score chip appears beside Debug. It also keeps the language-menu anti-jump fix and previous judge/package features.

## 1. Upload Package

From your local machine:

```bash
scp release/hydro-plugin-scratch-0.6.5.tgz <user>@<server>:/tmp/
scp scripts/install-production.sh scripts/rollback-production.sh <user>@<server>:/tmp/
```

## 2. Install

On the server:

```bash
chmod +x /tmp/install-production.sh /tmp/rollback-production.sh
/tmp/install-production.sh /tmp/hydro-plugin-scratch-0.6.5.tgz
```

By default the script installs to:

```text
~/.hydro/addons/hydro-plugin-scratch
```

Override if your Hydro uses another addon directory:

```bash
HYDRO_ADDONS_DIR=/path/to/hydro/addons /tmp/install-production.sh /tmp/hydro-plugin-scratch-0.6.5.tgz
```

## 3. Delta Update

If the full plugin and dependencies are already installed, the delta package can be extracted over the existing addon:

```bash
tar -xzf /tmp/hydro-plugin-scratch-update-0.6.5.tgz -C ~/.hydro/addons/hydro-plugin-scratch --strip-components=1
```

Then refresh production dependencies if you are upgrading from an older version:

```bash
cd ~/.hydro/addons/hydro-plugin-scratch
yarn --production
```

## 4. Restart Hydro

Use your actual process manager:

```bash
pm2 restart hydro
# or
sudo systemctl restart hydrooj
# or restart the Hydro container if deployed by Docker
```

## 5. Verify

Check:

```bash
hydrooj addon list
```

Then open Hydro and confirm:

- Problem creation page shows `Scratch Problem`.
- `/scratch/problem/:pid/config` opens for a Scratch problem.
- The Scratch config/edit page shows `Export Package`.
- `/scratch/problem/import` opens for administrators or users with problem creation permission.
- Exporting a Scratch problem downloads a `.scratch-problem.zip`.
- Importing that zip creates a normal Hydro problem with Scratch config restored.
- Uploading a valid `.sb3` succeeds.
- Uploading an invalid zip or non-`.sb3` fails.
- The normal Hydro problem page shows an `进入 Scratch 答题页面` link.
- The Scratch answering workspace can collapse/expand the problem statement and switch it to sticker mode.
- The Scratch GUI top bar shows `查看题目` beside `提交测评`.
- Submitting from the editor shows the latest score on the same answering page.
- Saving a draft and reopening the problem restores the student's latest work.
- `Auto Judge Config` accepts `staticChecks`, `structureChecks`, and `dynamicChecks`.
- A Hybrid test with `sprite_position` writes an Accepted/Wrong Answer score back to the Hydro record.

## Rollback

The install script prints the backup directory when it replaces an existing plugin.

```bash
/tmp/rollback-production.sh ~/.hydro/addons/hydro-plugin-scratch.bak.YYYYmmddHHMMSS
```

Restart Hydro after rollback.
