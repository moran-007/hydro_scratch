# Production Deploy

This plugin is packaged as:

```text
release/hydro-plugin-scratch-0.2.8.tgz
```

Deploy it on the production server as the same Linux user that runs Hydro.

## 1. Upload Package

From your local machine:

```bash
scp release/hydro-plugin-scratch-0.2.8.tgz <user>@<server>:/tmp/
scp scripts/install-production.sh scripts/rollback-production.sh <user>@<server>:/tmp/
```

## 2. Install

On the server:

```bash
chmod +x /tmp/install-production.sh /tmp/rollback-production.sh
/tmp/install-production.sh /tmp/hydro-plugin-scratch-0.2.8.tgz
```

By default the script installs to:

```text
~/.hydro/addons/hydro-plugin-scratch
```

Override if your Hydro uses another addon directory:

```bash
HYDRO_ADDONS_DIR=/path/to/hydro/addons /tmp/install-production.sh /tmp/hydro-plugin-scratch-0.2.8.tgz
```

## 3. Restart Hydro

Use your actual process manager:

```bash
pm2 restart hydro
# or
sudo systemctl restart hydrooj
# or restart the Hydro container if deployed by Docker
```

## 4. Verify

Check:

```bash
hydrooj addon list
```

Then open Hydro and confirm:

- Problem creation page shows `Scratch Problem`.
- `/scratch/problem/:pid/config` opens for a Scratch problem.
- Uploading a valid `.sb3` succeeds.
- Uploading an invalid zip or non-`.sb3` fails.

## Rollback

The install script prints the backup directory when it replaces an existing plugin.

```bash
/tmp/rollback-production.sh ~/.hydro/addons/hydro-plugin-scratch.bak.YYYYmmddHHMMSS
```

Restart Hydro after rollback.
