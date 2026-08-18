#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${CONTEXT_DB_PATH:-./contexts.db}"

# Show generation history and patterns
echo "📊 Cerebras Code Generation Context Analysis"
echo "=========================================="
echo

# Overall statistics
echo "📈 Overall Statistics:"
sqlite3 "$DB_PATH" <<SQL || echo "No data yet"
SELECT
    COUNT(*) as total_generations,
    COUNT(CASE WHEN success = 1 THEN 1 END) as successful,
    ROUND(COUNT(CASE WHEN success = 1 THEN 1 END) * 100.0 / COUNT(*), 2) as success_rate,
    ROUND(AVG(confidence_score), 2) as avg_confidence
FROM generations;
SQL

echo

# Top successful patterns by file type
echo "🎯 Successful Patterns by File Type:"
sqlite3 "$DB_PATH" <<SQL || echo "No successful patterns yet"
SELECT
    substr(file_path, length(file_path) - instr(reverse(file_path), '.') + 2) as file_type,
    COUNT(*) as count,
    ROUND(AVG(confidence_score), 2) as avg_confidence
FROM generations
WHERE success = 1
GROUP BY file_type
ORDER BY count DESC;
SQL

echo

# Recent failures
echo "❌ Recent Failures:"
sqlite3 "$DB_PATH" <<SQL || echo "No failures yet"
SELECT
    file_path,
    substr(prompt, 1, 100) || '...' as prompt_preview,
    error_message,
    created_at
FROM generations
WHERE success = 0
ORDER BY created_at DESC
LIMIT 5;
SQL

echo

# High-confidence examples
echo "⭐ High-Confidence Examples:"
sqlite3 "$DB_PATH" <<SQL || echo "No examples yet"
SELECT
    file_path,
    substr(prompt, 1, 80) || '...' as prompt_preview,
    confidence_score,
    created_at
FROM generations
WHERE success = 1 AND confidence_score > 0.9
ORDER BY confidence_score DESC, created_at DESC
LIMIT 3;
SQL

echo

# Recommendations
echo "💡 Recommendations:"
sqlite3 "$DB_PATH" <<SQL || echo "Generate some code first for recommendations"
WITH analysis AS (
    SELECT
        model,
        AVG(confidence_score) as avg_confidence,
        COUNT(*) as count
    FROM generations
    WHERE success = 1
    GROUP BY model
)
SELECT
    CASE
        WHEN COUNT(*) = 0 THEN '• Generate some code to see recommendations'
        WHEN MAX(avg_confidence) < 0.8 THEN '• Consider adjusting prompts for better results'
        WHEN MIN(count) < 3 THEN '• Generate more code with different models to compare'
        ELSE '• Current approach is working well!'
    END as recommendation
FROM analysis;
SQL

echo

echo "🔍 To query specific patterns:"
echo "sqlite3 $DB_PATH \"SELECT prompt FROM generations WHERE success = 1 AND file_path LIKE '%.py' LIMIT 3;\""