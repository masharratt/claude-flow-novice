#!/usr/bin/env bash
# fleet next-id
# Print the first WS id numerically above every existing roster row, QUEUED
# placeholders included, zero-padded to the widest existing id (min 2 digits).
# Empty roster prints WS01.
main(){
  [ $# -eq 0 ] || fleet_die 64 "usage: fleet next-id"
  local f
  f=$(fleet_roster_file)
  [ -f "$f" ] || fleet_die 64 "no roster at $f (fleet init first)"
  awk -F'\t' '
    NR > 1 && $1 ~ /^WS[0-9]+$/ {
      d = substr($1, 3); n = d + 0
      if (n > max) max = n
      if (length(d) > w) w = length(d)
    }
    END { if (w < 2) w = 2; printf "WS%0*d\n", w, max + 1 }' "$f"
}
