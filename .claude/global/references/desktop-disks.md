# Desktop disks (Windows + WSL2 machine)

Load when: disk space is low, a project writes big caches or build output, data is moved between disks, or a
WSL disk (vhdx) is attached, mounted, shrunk or grown. Measured 2026-11-02 (MDTWII disk plan,
`~/projects/MDTWII/planning/fleet-main/PLAN_desktop-disks_2026-11-01.md` and `HANDOFF_disk-evening_2026-11-02.md`).

## Layout
| Mount | Windows file | Kind | Holds |
|---|---|---|---|
| `/` | `D:\WSL\Ubuntu\ext4.vhdx` | dynamic, never shrinks by itself | code, installs, sessions, models: things that change slowly |
| `/mnt/wsl/churn` | `D:\WSL\churn-disk.vhdx` | **fixed 520 GiB** | everything written and deleted often: `CARGO_TARGET_DIR` for ALL projects (`/mnt/wsl/churn/cargo-target`), MDTWII warm builds, art trials + art cache, big `~/.cache` folders and `~/.npm` (symlinks into `churn/home-cache`) |
| `/mnt/wsl/build` | `C:\WSL\build-disk.vhdx` | dynamic | stable data: MDTWII game data `extracted/`, permanent art |
| `/mnt/d/wsl-cache` | plain D: folder | | pip, uv, HF, ollama, playwright, go caches (set in `~/.bashrc`) |

Both extra disks are attached at Windows logon by the scheduled task **"WSL build disk"**. After `wsl --shutdown` the
task does not rerun; a new shell runs it (`~/.bashrc` block "WSL cache relocation") or run
`schtasks /run /tn "WSL build disk"`.

## Rules
- **New project with big rebuildable output** (build dirs, caches, model downloads): put it on `/mnt/wsl/churn`
  (own folder or symlink), never on `/`. Anything on `/` that is written and deleted often grows D: for good.
- **Never enable WSL sparse VHD** (Microsoft warns of corruption). Shrinking is manual only.
- Keep pnpm's store on `/` (it hard-links into projects; across disks it copies and doubles use).
- Rust: never put `CARGO_TARGET_DIR` in RAM (`/dev/shm`); see `stack-rules.md`.

## Health and warnings
- `~/.local/bin/desktop-health.sh` (systemd user timer, about every 5 min), log
  `~/.local/state/desktop-health/health.log`: `d_free`, `c_free`, `build=`, `churn=`, `churn_used=`. Warns by mail
  at D: < 50 GB (pauses MDTWII art builds, resumes at 80), C: < 80 GB, churn >= 90 % used, disk not mounted.
- Daily: `lane-build-sweep.timer` 05:45 (MDTWII per-lane builds on churn), `art-cache-clean.timer` 05:30.
- `wsl-memory-monitor.service` (systemd user, 30 s): kills non-protected processes over 15 % of RAM, or a process
  group over 15 % combined. It can stop a big parallel build; stop it first (`systemctl --user stop
  wsl-memory-monitor`) for an intentional huge job, then start it again.

## Shrinking a dynamic disk (user runs, admin PowerShell)
1. Inside WSL: `wsl.exe -u root -e /usr/sbin/fstrim -v <mount>` (full path; plain `fstrim` is not found via wsl.exe).
2. `wsl --shutdown`, then `diskpart`: `select vdisk file="<path>"`, `attach vdisk readonly`, `compact vdisk`,
   `detach vdisk`. No sleep or power loss during compact.
3. **Expect about 1.5x of the used size, not the used size** (main 182 GiB used -> 271.6 GiB file; data 90 -> 161.7).
   Re-compact main when D: free < 60 GiB.

## Attaching, formatting, growing (admin PowerShell)
- `wsl --mount` / `--unmount` need an elevated PowerShell; from WSL they fail with `E_ACCESSDENIED`.
- New fixed disk: `New-VHD -Path <p> -SizeBytes <n>GB -Fixed` (PowerShell GB = GiB), `wsl --mount --vhd <p> --bare`,
  format (MDTWII `tools/dev/format-churn-disk.sh` refuses non-blank, mounted or wrong-size disks), then
  **`wsl --shutdown` before `wsl --mount --vhd <p> --name <label>`**: unmount + named mount right after a bare attach
  failed ("Operation not permitted", `main.cpp:801`).
- Grow a fixed disk: WSL stopped, `Resize-VHD -Path <p> -SizeBytes <n>GB`, remount, then
  `wsl.exe -u root -e /usr/sbin/resize2fs /dev/<dev>` (find it by label: `lsblk -o NAME,SIZE,LABEL`; device names
  change between restarts).
- Changing the logon task: `C:\Users\masha\setup-build-disk.ps1` (two-disk version) recreates both disks and the task.

## MDTWII path details
- In the MDTWII main checkout (`~/projects/MDTWII`), `.git/mdtwii-warm` resolves into the churn disk; the old `/mnt/wsl/build/mdtwii-warm/env.sh` is only a forwarding path. Do not assume another project's or a linked worktree's `.git` has this layout.
- Workshop trials/cache resolve to churn. Permanent study/archive/cc0/prepared/bodies/approved/refs/references/intake resolve into `/mnt/wsl/build/art-permanent`.
- Protected out-of-repo data roots are listed in `.zai-fence-readonly-roots`; keep that allowlist aligned with physical extracted-data storage when moving it.
