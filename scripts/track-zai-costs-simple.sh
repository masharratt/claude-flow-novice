#!/usr/bin/env bash
# Mock Cost Tracker
duration=$1
worker_type=$2

# Simulate random cost under $5
cost=$(awk 'BEGIN{srand(); print 4.99 * rand()}')
printf "Total Z.ai cost: \$%.2f\n" "$cost"
