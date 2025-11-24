#!/bin/bash
# scripts/security/scan-docker-images.sh
# Phase 6.2 :: CVE Scanner for Docker Images (IMPL-001 Stream 2)
# Scans all team Docker images for HIGH/CRITICAL CVEs using Trivy

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCAN_SEVERITY="HIGH,CRITICAL"
OUTPUT_DIR="${PROJECT_ROOT}/.artifacts/security/cve-scans"
REPORT_FILE="${OUTPUT_DIR}/cve-scan-report-$(date +%Y%m%d-%H%M%S).txt"
JSON_REPORT="${OUTPUT_DIR}/cve-scan-report-$(date +%Y%m%d-%H%M%S).json"

# Images to scan
IMAGES=(
  "cfn-agent:base"
  "cfn-agent:engineering"
  "cfn-agent:marketing"
  "cfn-agent:data"
)

# Create output directory
mkdir -p "$OUTPUT_DIR"

log_step() {
  echo -e "${BLUE}[STEP]${NC} $1"
}

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_trivy_installed() {
  log_step "Checking for Trivy installation"

  if ! command -v trivy &> /dev/null; then
    log_warn "Trivy not found. Installing..."

    # Install Trivy based on OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
      curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin v0.57.1
    elif [[ "$OSTYPE" == "darwin"* ]]; then
      brew install trivy
    else
      log_error "Unsupported OS. Please install Trivy manually: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
      exit 1
    fi

    log_info "Trivy installed successfully"
  else
    TRIVY_VERSION=$(trivy --version | head -n1)
    log_info "Trivy found: $TRIVY_VERSION"
  fi
}

check_image_exists() {
  local image=$1
  if ! docker image inspect "$image" &> /dev/null; then
    log_error "Image $image not found. Please build it first."
    return 1
  fi
  return 0
}

scan_image() {
  local image=$1
  local scan_output="${OUTPUT_DIR}/${image//:/-}-scan.txt"
  local json_output="${OUTPUT_DIR}/${image//:/-}-scan.json"

  log_step "Scanning image: $image"

  # Check if image exists
  if ! check_image_exists "$image"; then
    log_warn "Skipping $image (not built)"
    return 1
  fi

  # Run Trivy scan
  log_info "Running Trivy scan (severity: $SCAN_SEVERITY)..."

  # Text output for human readability
  trivy image \
    --severity "$SCAN_SEVERITY" \
    --format table \
    --output "$scan_output" \
    "$image" 2>&1 || true

  # JSON output for programmatic analysis
  trivy image \
    --severity "$SCAN_SEVERITY" \
    --format json \
    --output "$json_output" \
    "$image" 2>&1 || true

  # Count vulnerabilities
  local vuln_count=0
  if [[ -f "$json_output" ]]; then
    vuln_count=$(jq '[.Results[]?.Vulnerabilities[]?] | length' "$json_output" 2>/dev/null || echo "0")
  fi

  if [[ "$vuln_count" -eq 0 ]]; then
    log_info "✅ $image: No HIGH/CRITICAL CVEs found"
    return 0
  else
    log_warn "⚠️  $image: $vuln_count HIGH/CRITICAL CVE(s) found"
    return 1
  fi
}

generate_summary_report() {
  log_step "Generating summary report"

  {
    echo "=================================="
    echo "Docker Image CVE Scan Report"
    echo "=================================="
    echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "Severity: $SCAN_SEVERITY"
    echo "Scanned Images: ${#IMAGES[@]}"
    echo ""

    local total_vulns=0
    local clean_images=0
    local failed_scans=0

    for image in "${IMAGES[@]}"; do
      local json_output="${OUTPUT_DIR}/${image//:/-}-scan.json"

      if [[ ! -f "$json_output" ]]; then
        echo "❌ $image: Not scanned (image not built)"
        ((failed_scans++))
        continue
      fi

      local vuln_count
      vuln_count=$(jq '[.Results[]?.Vulnerabilities[]?] | length' "$json_output" 2>/dev/null || echo "0")
      total_vulns=$((total_vulns + vuln_count))

      if [[ "$vuln_count" -eq 0 ]]; then
        echo "✅ $image: No HIGH/CRITICAL CVEs"
        ((clean_images++))
      else
        echo "⚠️  $image: $vuln_count HIGH/CRITICAL CVE(s)"

        # List top 5 CVEs
        echo "   Top CVEs:"
        jq -r '.Results[]?.Vulnerabilities[]? | "   - \(.VulnerabilityID): \(.PkgName) (\(.Severity))"' "$json_output" 2>/dev/null | head -5
      fi
      echo ""
    done

    echo "=================================="
    echo "Summary:"
    echo "  Clean Images: $clean_images / ${#IMAGES[@]}"
    echo "  Total HIGH/CRITICAL CVEs: $total_vulns"
    echo "  Failed Scans: $failed_scans"
    echo "=================================="

    if [[ "$total_vulns" -eq 0 ]] && [[ "$failed_scans" -eq 0 ]]; then
      echo ""
      echo "✅ SUCCESS: All images passed CVE scan"
      echo "Gate: PASS"
    else
      echo ""
      echo "⚠️  WARNING: CVE vulnerabilities detected"
      echo "Gate: FAIL"
    fi

  } | tee "$REPORT_FILE"

  log_info "Summary report saved to: $REPORT_FILE"
}

generate_json_summary() {
  log_step "Generating JSON summary"

  local total_vulns=0
  local clean_images=0
  local images_json="["

  for image in "${IMAGES[@]}"; do
    local json_output="${OUTPUT_DIR}/${image//:/-}-scan.json"

    if [[ ! -f "$json_output" ]]; then
      continue
    fi

    local vuln_count
    vuln_count=$(jq '[.Results[]?.Vulnerabilities[]?] | length' "$json_output" 2>/dev/null || echo "0")
    total_vulns=$((total_vulns + vuln_count))

    if [[ "$vuln_count" -eq 0 ]]; then
      ((clean_images++))
    fi

    images_json+="{\"image\":\"$image\",\"vulnerabilities\":$vuln_count},"
  done

  # Remove trailing comma
  images_json="${images_json%,}]"

  # Create summary JSON
  cat > "$JSON_REPORT" <<EOF
{
  "scan_date": "$(date -Iseconds)",
  "severity": "$SCAN_SEVERITY",
  "total_images": ${#IMAGES[@]},
  "clean_images": $clean_images,
  "total_vulnerabilities": $total_vulns,
  "gate_status": $([ "$total_vulns" -eq 0 ] && echo '"PASS"' || echo '"FAIL"'),
  "images": $images_json
}
EOF

  log_info "JSON summary saved to: $JSON_REPORT"
}

main() {
  log_step "Starting Docker Image CVE Scan"

  # Check prerequisites
  check_trivy_installed

  # Scan all images
  local scan_failures=0
  for image in "${IMAGES[@]}"; do
    if ! scan_image "$image"; then
      ((scan_failures++))
    fi
  done

  # Generate reports
  generate_summary_report
  generate_json_summary

  echo ""
  log_step "Scan complete. Reports available in: $OUTPUT_DIR"

  # Exit code based on scan results
  if [[ "$scan_failures" -gt 0 ]]; then
    log_warn "Some images have HIGH/CRITICAL CVEs"
    exit 1
  else
    log_info "All images passed CVE scan"
    exit 0
  fi
}

# Run main function
main "$@"
