#!/bin/bash
# Test script for post-commit hook validation

function hook_test_function() {
    echo "This function should appear in the index"
}

function another_test_fn() {
    echo "Second function for verification"
}
