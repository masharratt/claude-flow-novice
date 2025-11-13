#!/bin/bash

source ./test_mode_detection.sh

echo "Testing Task mode completion..."

# Test valid completion
result=$(task_mode_complete 0.85 "COMPLETE" "Work done" "file1.js" "file2.js")
echo "Result: $result"

# Test invalid confidence
echo "Testing invalid confidence..."
invalid_result=$(task_mode_complete 1.5 "COMPLETE" "Test" 2>&1 || echo "ERROR")
echo "Invalid result: $invalid_result"

# Test no deliverables
no_deliverables=$(task_mode_complete 0.90 "COMPLETE" "Work done")
echo "No deliverables: $no_deliverables"
