# Desktop operations

Load when: desktop temperature, sensor, memory/swap, session-PID or TCP diagnosis. Disk layout/space policy lives in desktop-disks.md.

## Health and sensors
- Read `~/.local/state/desktop-health/health.log` and current HOT state before pairing desktop work. Never infer temperature from load percentage alone.
- desktop-health.sh runs as a user timer; its health and tcp-top logs preserve CPU, memory, mount and connection evidence. Current script/config owns thresholds, not an old observation in a note.
- A missing/stale CPU reading is not permission to bypass a heat gate. Start the scheduled `MDTWII LibreHardwareMonitor` task, refresh desktop-health.service and verify a fresh CPU line.
- A live LHM process can still have a stale CSV after clock rollback. Verify newest CSV age; restart through its scheduled task when stale and owned/authorized.
- The recorded processor-state 99% cap did not reliably disable turbo. Use actual temperature/power readings and the user's current system configuration; ask before changing a power plan.
- After a crash, inspect for empty git objects and preserve suspect files for coordinated recovery from a verified remote; never reset/clean the working tree.

## Memory and session diagnosis
- Full swap can be cold pages. Check /proc/pressure/memory and each process's VmSwap before attributing current pressure.
- Check idle development servers and exceptional trial jobs before blaming the shared pipeline. Ask the owner before stopping another project's process.
- A session PID can be reused after reboot. Compare the session's procStart with /proc/<pid>/stat start time before acting; preserve mismatched records aside instead of killing the new process.

## TCP safety
- The desktop fleet dashboard on localhost:4880 previously filled ephemeral ports with TIME_WAIT traffic. Keep it stopped pending a verified fix; an explicit user restart request needs the known-risk explanation and five-minute health-log watch.
- Correlate tcp-top/health logs with Windows TCP events before naming a cause. The old flood does not prove every later restart or connection spike has that cause.
