#!/usr/bin/env bash
set -eu

# Task Classifier - Categorize tasks into predefined types
# Usage: ./task-classifier.sh "task description"

TASK_DESCRIPTION="${1:-}"

if [ -z "$TASK_DESCRIPTION" ]; then
  echo "default"
  exit 0
fi

# Convert to lowercase for matching
TASK_LOWER=$(echo "$TASK_DESCRIPTION" | tr '[:upper:]' '[:lower:]')

# Classification logic (priority order matters)

# Security (highest priority - security-critical)
if echo "$TASK_LOWER" | grep -qE "(security|vulnerability|exploit|encryption|ssl|tls|certificate|oauth|saml|rbac|permission|auth|jwt|authentication|authorization)"; then
  echo "security"
  exit 0
fi

# Infrastructure (DevOps, Docker, K8s)
if echo "$TASK_LOWER" | grep -qE "(docker|kubernetes|k8s|helm|deployment|ci/cd|pipeline|aws|gcp|azure|cloud|terraform|ansible|infrastructure)"; then
  echo "infrastructure"
  exit 0
fi

# Mobile (iOS, Android, React Native)
if echo "$TASK_LOWER" | grep -qE "(mobile|ios|android|react-native|react native|swift|kotlin|flutter|app store|play store)"; then
  echo "mobile"
  exit 0
fi

# Fullstack (Frontend + Backend keywords)
if echo "$TASK_LOWER" | grep -qE "(fullstack|full-stack|full stack)" || \
   (echo "$TASK_LOWER" | grep -qE "(react|vue|angular|svelte|frontend|ui)" && \
    echo "$TASK_LOWER" | grep -qE "(api|backend|server|database|endpoint)"); then
  echo "fullstack"
  exit 0
fi

# Performance (Optimization, benchmarking) - Check early due to broad keywords
if echo "$TASK_LOWER" | grep -qE "(performance|benchmark|latency|throughput|profiling|memory leak|cpu usage|slow|optimize|optimiz)"; then
  echo "performance"
  exit 0
fi

# Database (Schema, migrations, design)
if echo "$TASK_LOWER" | grep -qE "(schema|migration|index|database.*query|sql|nosql|postgres|mongodb|redis|mysql|database design|table design|user.*table|create.*table)"; then
  echo "database"
  exit 0
fi

# Frontend (React, TypeScript, UI/UX)
if echo "$TASK_LOWER" | grep -qE "(react|vue|angular|svelte|typescript|javascript|css|scss|tailwind|ui|ux|design|component|frontend|next\.js|remix)"; then
  echo "frontend"
  exit 0
fi

# Backend API (REST, GraphQL, endpoints)
if echo "$TASK_LOWER" | grep -qE "(api|rest|graphql|endpoint|middleware|express|fastify|nest\.js|backend|server|microservice)"; then
  echo "backend-api"
  exit 0
fi

# Default fallback
echo "default"
exit 0
