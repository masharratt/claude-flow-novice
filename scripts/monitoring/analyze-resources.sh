#!/bin/bash
# Analysis script for resource monitoring results
# Identifies leaks, spikes, and anomalies

set -euo pipefail

CSV_FILE="${1:-}"

if [ -z "${CSV_FILE}" ] || [ ! -f "${CSV_FILE}" ]; then
    echo "Usage: $0 <csv_file>"
    echo "Example: $0 ./reports/monitoring/resource-usage-20250106_120000.csv"
    exit 1
fi

OUTPUT_DIR=$(dirname "${CSV_FILE}")
REPORT_FILE="${OUTPUT_DIR}/analysis-report-$(date +%Y%m%d_%H%M%S).txt"

echo "========================================" | tee "${REPORT_FILE}"
echo "RESOURCE MONITORING ANALYSIS REPORT" | tee -a "${REPORT_FILE}"
echo "========================================" | tee -a "${REPORT_FILE}"
echo "Input: ${CSV_FILE}" | tee -a "${REPORT_FILE}"
echo "Generated: $(date)" | tee -a "${REPORT_FILE}"
echo "" | tee -a "${REPORT_FILE}"

# Skip header, get data
DATA=$(tail -n +2 "${CSV_FILE}")

if [ -z "${DATA}" ]; then
    echo "ERROR: No data found in CSV file" | tee -a "${REPORT_FILE}"
    exit 1
fi

# Total samples
TOTAL_SAMPLES=$(echo "${DATA}" | wc -l)
echo "Total Samples: ${TOTAL_SAMPLES}" | tee -a "${REPORT_FILE}"

# Duration
FIRST_ELAPSED=$(echo "${DATA}" | head -1 | cut -d',' -f2)
LAST_ELAPSED=$(echo "${DATA}" | tail -1 | cut -d',' -f2)
DURATION=$((LAST_ELAPSED - FIRST_ELAPSED))
echo "Duration: ${DURATION} seconds" | tee -a "${REPORT_FILE}"
echo "" | tee -a "${REPORT_FILE}"

# Memory RSS analysis
echo "========================================" | tee -a "${REPORT_FILE}"
echo "MEMORY (RSS) ANALYSIS" | tee -a "${REPORT_FILE}"
echo "========================================" | tee -a "${REPORT_FILE}"

MEMORY_RSS_VALUES=$(echo "${DATA}" | cut -d',' -f3)
MEMORY_RSS_MIN=$(echo "${MEMORY_RSS_VALUES}" | sort -n | head -1)
MEMORY_RSS_MAX=$(echo "${MEMORY_RSS_VALUES}" | sort -n | tail -1)
MEMORY_RSS_AVG=$(echo "${MEMORY_RSS_VALUES}" | awk '{sum+=$1; count++} END {printf "%.2f", sum/count}')

MEMORY_RSS_FIRST=$(echo "${MEMORY_RSS_VALUES}" | head -1)
MEMORY_RSS_LAST=$(echo "${MEMORY_RSS_VALUES}" | tail -1)
MEMORY_RSS_GROWTH=$(echo "scale=2; ${MEMORY_RSS_LAST} - ${MEMORY_RSS_FIRST}" | bc)
MEMORY_RSS_GROWTH_RATE=$(echo "scale=4; ${MEMORY_RSS_GROWTH} / ${DURATION}" | bc 2>/dev/null || echo "0")

echo "Min: ${MEMORY_RSS_MIN} MB" | tee -a "${REPORT_FILE}"
echo "Max: ${MEMORY_RSS_MAX} MB" | tee -a "${REPORT_FILE}"
echo "Avg: ${MEMORY_RSS_AVG} MB" | tee -a "${REPORT_FILE}"
echo "First: ${MEMORY_RSS_FIRST} MB" | tee -a "${REPORT_FILE}"
echo "Last: ${MEMORY_RSS_LAST} MB" | tee -a "${REPORT_FILE}"
echo "Growth: ${MEMORY_RSS_GROWTH} MB" | tee -a "${REPORT_FILE}"
echo "Growth Rate: ${MEMORY_RSS_GROWTH_RATE} MB/sec" | tee -a "${REPORT_FILE}"

# Memory leak detection (growth rate > 1 MB/sec)
if (( $(echo "${MEMORY_RSS_GROWTH_RATE} > 1.0" | bc -l 2>/dev/null || echo 0) )); then
    echo "⚠️  LEAK DETECTED: Memory growing at ${MEMORY_RSS_GROWTH_RATE} MB/sec" | tee -a "${REPORT_FILE}"
elif (( $(echo "${MEMORY_RSS_GROWTH_RATE} > 0.1" | bc -l 2>/dev/null || echo 0) )); then
    echo "⚠️  WARNING: Slow memory growth detected (${MEMORY_RSS_GROWTH_RATE} MB/sec)" | tee -a "${REPORT_FILE}"
else
    echo "✅ No significant memory leak detected" | tee -a "${REPORT_FILE}"
fi
echo "" | tee -a "${REPORT_FILE}"

# CPU analysis
echo "========================================" | tee -a "${REPORT_FILE}"
echo "CPU ANALYSIS" | tee -a "${REPORT_FILE}"
echo "========================================" | tee -a "${REPORT_FILE}"

CPU_VALUES=$(echo "${DATA}" | cut -d',' -f6)
CPU_MIN=$(echo "${CPU_VALUES}" | sort -n | head -1)
CPU_MAX=$(echo "${CPU_VALUES}" | sort -n | tail -1)
CPU_AVG=$(echo "${CPU_VALUES}" | awk '{sum+=$1; count++} END {printf "%.2f", sum/count}')

echo "Min: ${CPU_MIN}%" | tee -a "${REPORT_FILE}"
echo "Max: ${CPU_MAX}%" | tee -a "${REPORT_FILE}"
echo "Avg: ${CPU_AVG}%" | tee -a "${REPORT_FILE}"

# CPU spike detection (>80% sustained for >5 samples)
CPU_SPIKES=$(echo "${CPU_VALUES}" | awk '{if ($1 > 80) count++} END {print count}')
if [ "${CPU_SPIKES}" -gt 5 ]; then
    echo "⚠️  CPU SPIKES: ${CPU_SPIKES} samples above 80%" | tee -a "${REPORT_FILE}"
else
    echo "✅ No sustained CPU spikes detected" | tee -a "${REPORT_FILE}"
fi
echo "" | tee -a "${REPORT_FILE}"

# File descriptor analysis
echo "========================================" | tee -a "${REPORT_FILE}"
echo "FILE DESCRIPTOR ANALYSIS" | tee -a "${REPORT_FILE}"
echo "========================================" | tee -a "${REPORT_FILE}"

FD_VALUES=$(echo "${DATA}" | cut -d',' -f7)
FD_MIN=$(echo "${FD_VALUES}" | sort -n | head -1)
FD_MAX=$(echo "${FD_VALUES}" | sort -n | tail -1)
FD_AVG=$(echo "${FD_VALUES}" | awk '{sum+=$1; count++} END {printf "%.0f", sum/count}')

FD_FIRST=$(echo "${FD_VALUES}" | head -1)
FD_LAST=$(echo "${FD_VALUES}" | tail -1)
FD_GROWTH=$((FD_LAST - FD_FIRST))

echo "Min: ${FD_MIN}" | tee -a "${REPORT_FILE}"
echo "Max: ${FD_MAX}" | tee -a "${REPORT_FILE}"
echo "Avg: ${FD_AVG}" | tee -a "${REPORT_FILE}"
echo "First: ${FD_FIRST}" | tee -a "${REPORT_FILE}"
echo "Last: ${FD_LAST}" | tee -a "${REPORT_FILE}"
echo "Growth: ${FD_GROWTH}" | tee -a "${REPORT_FILE}"

# FD leak detection (growth > 100)
if [ "${FD_GROWTH}" -gt 100 ]; then
    echo "⚠️  FD LEAK DETECTED: ${FD_GROWTH} unclosed file descriptors" | tee -a "${REPORT_FILE}"
elif [ "${FD_GROWTH}" -gt 20 ]; then
    echo "⚠️  WARNING: FD growth detected (${FD_GROWTH})" | tee -a "${REPORT_FILE}"
else
    echo "✅ No significant FD leak detected" | tee -a "${REPORT_FILE}"
fi
echo "" | tee -a "${REPORT_FILE}"

# Process count analysis
echo "========================================" | tee -a "${REPORT_FILE}"
echo "PROCESS COUNT ANALYSIS" | tee -a "${REPORT_FILE}"
echo "========================================" | tee -a "${REPORT_FILE}"

PROC_VALUES=$(echo "${DATA}" | cut -d',' -f8)
PROC_MIN=$(echo "${PROC_VALUES}" | sort -n | head -1)
PROC_MAX=$(echo "${PROC_VALUES}" | sort -n | tail -1)
PROC_AVG=$(echo "${PROC_VALUES}" | awk '{sum+=$1; count++} END {printf "%.0f", sum/count}')

PROC_FIRST=$(echo "${PROC_VALUES}" | head -1)
PROC_LAST=$(echo "${PROC_VALUES}" | tail -1)
PROC_GROWTH=$((PROC_LAST - PROC_FIRST))

echo "Min: ${PROC_MIN}" | tee -a "${REPORT_FILE}"
echo "Max: ${PROC_MAX}" | tee -a "${REPORT_FILE}"
echo "Avg: ${PROC_AVG}" | tee -a "${REPORT_FILE}"
echo "First: ${PROC_FIRST}" | tee -a "${REPORT_FILE}"
echo "Last: ${PROC_LAST}" | tee -a "${REPORT_FILE}"
echo "Growth: ${PROC_GROWTH}" | tee -a "${REPORT_FILE}"

# Process leak detection (growth > 50)
if [ "${PROC_GROWTH}" -gt 50 ]; then
    echo "⚠️  PROCESS LEAK DETECTED: ${PROC_GROWTH} orphaned processes" | tee -a "${REPORT_FILE}"
elif [ "${PROC_GROWTH}" -gt 10 ]; then
    echo "⚠️  WARNING: Process growth detected (${PROC_GROWTH})" | tee -a "${REPORT_FILE}"
else
    echo "✅ No significant process leak detected" | tee -a "${REPORT_FILE}"
fi
echo "" | tee -a "${REPORT_FILE}"

# Anomaly summary
echo "========================================" | tee -a "${REPORT_FILE}"
echo "ANOMALY SUMMARY" | tee -a "${REPORT_FILE}"
echo "========================================" | tee -a "${REPORT_FILE}"

ANOMALY_COUNT=0

if (( $(echo "${MEMORY_RSS_GROWTH_RATE} > 0.1" | bc -l 2>/dev/null || echo 0) )); then
    echo "• Memory growth: ${MEMORY_RSS_GROWTH_RATE} MB/sec" | tee -a "${REPORT_FILE}"
    ANOMALY_COUNT=$((ANOMALY_COUNT + 1))
fi

if [ "${CPU_SPIKES}" -gt 5 ]; then
    echo "• CPU spikes: ${CPU_SPIKES} samples above 80%" | tee -a "${REPORT_FILE}"
    ANOMALY_COUNT=$((ANOMALY_COUNT + 1))
fi

if [ "${FD_GROWTH}" -gt 20 ]; then
    echo "• FD growth: ${FD_GROWTH}" | tee -a "${REPORT_FILE}"
    ANOMALY_COUNT=$((ANOMALY_COUNT + 1))
fi

if [ "${PROC_GROWTH}" -gt 10 ]; then
    echo "• Process growth: ${PROC_GROWTH}" | tee -a "${REPORT_FILE}"
    ANOMALY_COUNT=$((ANOMALY_COUNT + 1))
fi

if [ "${ANOMALY_COUNT}" -eq 0 ]; then
    echo "✅ No anomalies detected - system healthy" | tee -a "${REPORT_FILE}"
else
    echo "" | tee -a "${REPORT_FILE}"
    echo "⚠️  Total anomalies: ${ANOMALY_COUNT}" | tee -a "${REPORT_FILE}"
fi

echo "" | tee -a "${REPORT_FILE}"
echo "========================================" | tee -a "${REPORT_FILE}"
echo "Report saved: ${REPORT_FILE}" | tee -a "${REPORT_FILE}"
echo "========================================" | tee -a "${REPORT_FILE}"
