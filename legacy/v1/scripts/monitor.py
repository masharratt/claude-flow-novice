#!/usr/bin/env python3
import subprocess
import time
from datetime import datetime

ITERATIONS = 20
INTERVAL = 30

print("=== Memory Monitor Started ===")
print(f"Monitoring for {ITERATIONS * INTERVAL} seconds ({ITERATIONS} checks)")
print(f"Timestamp: {datetime.now()}")
print()

for i in range(1, ITERATIONS + 1):
    timestamp = datetime.now().strftime('%H:%M:%S')

    # Total memory
    mem_cmd = "ps aux | grep -E '(claude|node)' | grep -v grep | awk '{sum+=$6} END {printf \"%.1f\", sum/1024}'"
    total_mem = subprocess.getoutput(mem_cmd)

    # Process counts
    node_count = subprocess.getoutput("ps aux | grep node | grep -v grep | grep -v snapfuse | wc -l").strip()
    claude_count = subprocess.getoutput("ps aux | grep claude | grep -v grep | wc -l").strip()
    zombie_count = subprocess.getoutput("ps aux | grep '<defunct>' | grep -v grep | wc -l").strip()
    find_count = subprocess.getoutput("ps aux | grep 'find /mnt/c' | grep -v grep | wc -l").strip()

    print(f"[{i}/{ITERATIONS}] [{timestamp}] MEM: {total_mem}MB | Node: {node_count} | Claude: {claude_count} | Zombies: {zombie_count} | Find: {find_count}")

    # Alerts
    if total_mem and float(total_mem) > 10000:
        print("  ⚠️  WARNING: Memory usage exceeds 10GB!")

    if find_count and int(find_count) > 0:
        print(f"  🔴 CRITICAL: {find_count} find commands on /mnt/c (MEMORY BOMB!)")

    if zombie_count and int(zombie_count) > 0:
        print(f"  💀 ZOMBIE: {zombie_count} zombie processes detected")

    if i < ITERATIONS:
        time.sleep(INTERVAL)

print()
print("=== Monitoring Complete ===")
