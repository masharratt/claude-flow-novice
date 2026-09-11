#!/usr/bin/env bash
# Fake worker engine for tests: prints a banner the banner gate can match,
# then holds the pane open so send/status/capture have something to hit.
printf 'AGENTS-TEST-BANNER ready\n'
exec cat
