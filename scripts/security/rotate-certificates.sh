#!/bin/bash
# Phase 6 #4: mTLS Certificate Rotation Script
#
# Checks certificate expiration and automatically rotates certificates
# that are expiring within 30 days. Performs graceful service restarts.

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
CERT_DIR="${PROJECT_ROOT}/.certs"
EXPIRY_THRESHOLD_DAYS=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check if certificates exist
check_certificates_exist() {
  if [ ! -d "${CERT_DIR}" ]; then
    log_error "Certificate directory not found: ${CERT_DIR}"
    log_info "Run scripts/security/generate-certificates.sh first"
    exit 1
  fi

  if [ ! -f "${CERT_DIR}/ca/ca-cert.pem" ]; then
    log_error "CA certificate not found"
    exit 1
  fi
}

# Get certificate expiration date
get_cert_expiry_date() {
  local cert_file=$1
  openssl x509 -in "$cert_file" -noout -enddate | cut -d= -f2
}

# Get days until expiration
get_days_until_expiry() {
  local cert_file=$1
  local expiry_date=$(get_cert_expiry_date "$cert_file")
  local expiry_epoch=$(date -d "$expiry_date" +%s)
  local now_epoch=$(date +%s)
  local days_remaining=$(( ($expiry_epoch - $now_epoch) / 86400 ))
  echo $days_remaining
}

# Check if certificate needs rotation
needs_rotation() {
  local cert_file=$1
  local days_remaining=$(get_days_until_expiry "$cert_file")

  if [ $days_remaining -le $EXPIRY_THRESHOLD_DAYS ]; then
    return 0  # true
  else
    return 1  # false
  fi
}

# Check all certificates
check_all_certificates() {
  log_info "Checking certificate expiration dates..."
  echo

  local needs_rotation=false

  # Check CA certificate
  local ca_cert="${CERT_DIR}/ca/ca-cert.pem"
  local ca_days=$(get_days_until_expiry "$ca_cert")

  echo "CA Certificate:"
  echo "  Expiry Date: $(get_cert_expiry_date "$ca_cert")"
  echo "  Days Remaining: $ca_days"

  if [ $ca_days -le $EXPIRY_THRESHOLD_DAYS ]; then
    log_warn "CA certificate expires in $ca_days days - ROTATION NEEDED"
    needs_rotation=true
  else
    log_info "CA certificate valid for $ca_days days"
  fi
  echo

  # Check service certificates
  for service in redis postgres client; do
    local cert_file="${CERT_DIR}/${service}/${service}-cert.pem"

    if [ ! -f "$cert_file" ]; then
      log_warn "${service} certificate not found"
      continue
    fi

    local days=$(get_days_until_expiry "$cert_file")

    echo "${service} Certificate:"
    echo "  Expiry Date: $(get_cert_expiry_date "$cert_file")"
    echo "  Days Remaining: $days"

    if [ $days -le $EXPIRY_THRESHOLD_DAYS ]; then
      log_warn "${service} certificate expires in $days days - ROTATION NEEDED"
      needs_rotation=true
    else
      log_info "${service} certificate valid for $days days"
    fi
    echo
  done

  if [ "$needs_rotation" = true ]; then
    return 0
  else
    return 1
  fi
}

# Backup existing certificates
backup_certificates() {
  log_info "Backing up existing certificates..."

  local backup_dir="${CERT_DIR}.backup.$(date +%Y%m%d-%H%M%S)"
  cp -r "${CERT_DIR}" "$backup_dir"

  log_info "Certificates backed up to: $backup_dir"
  echo "$backup_dir"
}

# Rotate certificates
rotate_certificates() {
  log_info "Starting certificate rotation..."

  # Backup existing certificates
  local backup_dir=$(backup_certificates)

  # Generate new certificates
  log_info "Generating new certificates..."
  if "${PROJECT_ROOT}/scripts/security/generate-certificates.sh" > /dev/null 2>&1; then
    log_info "New certificates generated successfully"
  else
    log_error "Failed to generate new certificates"
    log_info "Restoring backup..."
    rm -rf "${CERT_DIR}"
    mv "$backup_dir" "${CERT_DIR}"
    exit 1
  fi
}

# Restart Docker services
restart_docker_services() {
  log_info "Restarting Docker services..."

  if command -v docker-compose &> /dev/null; then
    local compose_file="${PROJECT_ROOT}/docker-compose.yml"

    if [ -f "$compose_file" ]; then
      log_info "Found docker-compose.yml, restarting services..."

      # Restart Redis
      docker-compose restart redis 2>/dev/null || log_warn "Failed to restart Redis"

      # Restart PostgreSQL
      docker-compose restart postgres 2>/dev/null || log_warn "Failed to restart PostgreSQL"

      log_info "Services restarted"
    else
      log_warn "docker-compose.yml not found, skipping service restart"
    fi
  else
    log_warn "docker-compose not found, skipping service restart"
  fi
}

# Verify new certificates
verify_new_certificates() {
  log_info "Verifying new certificates..."

  local all_valid=true

  # Verify CA certificate
  if openssl x509 -in "${CERT_DIR}/ca/ca-cert.pem" -noout -text > /dev/null 2>&1; then
    log_info "CA certificate is valid"
  else
    log_error "CA certificate is invalid"
    all_valid=false
  fi

  # Verify service certificates
  for service in redis postgres client; do
    local cert_file="${CERT_DIR}/${service}/${service}-cert.pem"

    if [ ! -f "$cert_file" ]; then
      continue
    fi

    if openssl verify -CAfile "${CERT_DIR}/ca/ca-cert.pem" "$cert_file" > /dev/null 2>&1; then
      log_info "${service} certificate is valid"
    else
      log_error "${service} certificate is invalid"
      all_valid=false
    fi
  done

  if [ "$all_valid" = true ]; then
    log_info "All new certificates verified successfully"
    return 0
  else
    log_error "Some new certificates failed verification"
    return 1
  fi
}

# Send notification
send_notification() {
  local subject=$1
  local message=$2

  # Log notification
  log_info "Notification: $subject"
  echo "$message"

  # TODO: Integrate with notification system (email, Slack, etc.)
  # Example: curl -X POST slack_webhook -d "{\"text\":\"$message\"}"
}

# Main execution
main() {
  echo "=========================================="
  echo "CFN mTLS Certificate Rotation"
  echo "=========================================="
  echo

  # Check if certificates exist
  check_certificates_exist

  # Check all certificates
  if check_all_certificates; then
    log_warn "Some certificates need rotation"
    echo

    # Ask for confirmation unless --force flag is provided
    if [ "${1:-}" != "--force" ] && [ "${1:-}" != "-f" ]; then
      read -p "Do you want to rotate certificates now? (y/N): " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Certificate rotation cancelled"
        exit 0
      fi
    fi

    # Rotate certificates
    rotate_certificates

    # Verify new certificates
    if verify_new_certificates; then
      log_info "Certificate rotation completed successfully"
    else
      log_error "Certificate rotation verification failed"
      exit 1
    fi

    # Restart services
    restart_docker_services

    # Send notification
    send_notification \
      "CFN mTLS Certificates Rotated" \
      "All mTLS certificates have been successfully rotated and services restarted."

    echo
    log_info "Certificate rotation completed successfully!"
    log_info "Certificate location: ${CERT_DIR}"
  else
    log_info "All certificates are valid"
    log_info "No rotation needed at this time"
  fi

  echo
  log_info "Next check: Run this script again in $(( (365 - EXPIRY_THRESHOLD_DAYS) / 30 )) months"
}

# Support cron execution
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
  main "$@"
fi
