# Shell command safety

Load when: rewriting a file from the shell, replacing a script another session may be running, taking a backup across a sandbox boundary, or killing processes.

- Never rewrite a file through wrapped grep. Use Edit/Write or an explicit raw tool; validate the complete result before replacing the original.
- Replace a shared running shell script atomically: edit a sibling copy, validate it, then rename it over the original.
- Use one checked absolute backup path across sandbox boundaries; TMPDIR may change. Confirm the backup exists before changing the source.
- Run process termination in a separate shell call. Other text in the same command can make even a bracketed pkill pattern match its own shell.
