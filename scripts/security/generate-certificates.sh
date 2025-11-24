#!/bin/bash
# Phase 6 #4: mTLS Certificate Generation Script
#
# Generates CA and service certificates for mutual TLS authentication
# between services (Redis, PostgreSQL, Docker daemon).

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
CERT_DIR="${PROJECT_ROOT}/.certs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check for openssl
if ! command -v openssl &> /dev/null; then
  log_error "openssl is required but not installed"
  exit 1
fi

# Create certificate directory structure
create_cert_directories() {
  log_info "Creating certificate directory structure..."

  mkdir -p "${CERT_DIR}"/{ca,redis,postgres,client}

  # Set restrictive permissions
  chmod 750 "${CERT_DIR}"
  chmod 750 "${CERT_DIR}"/{ca,redis,postgres,client}
}

# Generate CA certificate
generate_ca() {
  log_info "Generating Certificate Authority..."

  # Generate CA private key
  openssl genrsa -out "${CERT_DIR}/ca/ca-key.pem" 4096

  # Generate CA certificate
  openssl req -new -x509 \
    -key "${CERT_DIR}/ca/ca-key.pem" \
    -out "${CERT_DIR}/ca/ca-cert.pem" \
    -days 365 \
    -subj "/C=US/ST=State/L=City/O=CFN/OU=Development/CN=CFN-CA"

  # Set restrictive permissions
  chmod 600 "${CERT_DIR}/ca/ca-key.pem"
  chmod 644 "${CERT_DIR}/ca/ca-cert.pem"

  log_info "CA certificate generated successfully"
}

# Generate service certificate
generate_service_cert() {
  local service=$1
  local common_name=$2
  local san="${3:-}"

  log_info "Generating ${service} certificate..."

  local cert_dir="${CERT_DIR}/${service}"

  # Generate private key
  openssl genrsa -out "${cert_dir}/${service}-key.pem" 4096

  # Create certificate signing request (CSR)
  openssl req -new \
    -key "${cert_dir}/${service}-key.pem" \
    -out "${cert_dir}/${service}.csr" \
    -subj "/C=US/ST=State/L=City/O=CFN/OU=Services/CN=${common_name}"

  # Create extensions file for SAN
  if [ -n "$san" ]; then
    cat > "${cert_dir}/${service}-ext.cnf" << EOF
subjectAltName = ${san}
EOF
  fi

  # Sign certificate with CA
  if [ -n "$san" ]; then
    openssl x509 -req \
      -in "${cert_dir}/${service}.csr" \
      -CA "${CERT_DIR}/ca/ca-cert.pem" \
      -CAkey "${CERT_DIR}/ca/ca-key.pem" \
      -CAcreateserial \
      -out "${cert_dir}/${service}-cert.pem" \
      -days 365 \
      -extfile "${cert_dir}/${service}-ext.cnf"
  else
    openssl x509 -req \
      -in "${cert_dir}/${service}.csr" \
      -CA "${CERT_DIR}/ca/ca-cert.pem" \
      -CAkey "${CERT_DIR}/ca/ca-key.pem" \
      -CAcreateserial \
      -out "${cert_dir}/${service}-cert.pem" \
      -days 365
  fi

  # Clean up CSR and extensions file
  rm "${cert_dir}/${service}.csr"
  [ -f "${cert_dir}/${service}-ext.cnf" ] && rm "${cert_dir}/${service}-ext.cnf"

  # Set restrictive permissions
  chmod 600 "${cert_dir}/${service}-key.pem"
  chmod 644 "${cert_dir}/${service}-cert.pem"

  log_info "${service} certificate generated successfully"
}

# Generate all certificates
generate_all_certificates() {
  log_info "Starting certificate generation..."

  # Create directory structure
  create_cert_directories

  # Generate CA
  generate_ca

  # Generate service certificates
  generate_service_cert "redis" "redis" "DNS:redis,DNS:localhost,IP:127.0.0.1"
  generate_service_cert "postgres" "postgres" "DNS:postgres,DNS:localhost,IP:127.0.0.1"
  generate_service_cert "client" "client"

  log_info "All certificates generated successfully"
}

# Verify certificates
verify_certificates() {
  log_info "Verifying certificates..."

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
    if openssl verify -CAfile "${CERT_DIR}/ca/ca-cert.pem" "${CERT_DIR}/${service}/${service}-cert.pem" > /dev/null 2>&1; then
      log_info "${service} certificate is valid"
    else
      log_error "${service} certificate is invalid"
      all_valid=false
    fi
  done

  if [ "$all_valid" = true ]; then
    log_info "All certificates verified successfully"
    return 0
  else
    log_error "Some certificates failed verification"
    return 1
  fi
}

# Display certificate information
display_cert_info() {
  log_info "Certificate Information:"
  echo

  for service in ca redis postgres client; do
    local cert_file
    if [ "$service" = "ca" ]; then
      cert_file="${CERT_DIR}/ca/ca-cert.pem"
    else
      cert_file="${CERT_DIR}/${service}/${service}-cert.pem"
    fi

    echo "=== ${service} Certificate ==="
    openssl x509 -in "$cert_file" -noout -subject -issuer -dates
    echo
  done
}

# Update .gitignore
update_gitignore() {
  local gitignore="${PROJECT_ROOT}/.gitignore"

  if [ -f "$gitignore" ]; then
    if ! grep -q "^\.certs/" "$gitignore"; then
      log_info "Adding .certs/ to .gitignore..."
      echo "" >> "$gitignore"
      echo "# mTLS Certificates (generated by scripts/security/generate-certificates.sh)" >> "$gitignore"
      echo ".certs/" >> "$gitignore"
      log_info ".gitignore updated"
    else
      log_info ".certs/ already in .gitignore"
    fi
  else
    log_warn ".gitignore not found, creating one..."
    echo ".certs/" > "$gitignore"
  fi
}

# Main execution
main() {
  echo "=========================================="
  echo "CFN mTLS Certificate Generation"
  echo "=========================================="
  echo

  # Check if certificates already exist
  if [ -d "${CERT_DIR}/ca" ] && [ -f "${CERT_DIR}/ca/ca-cert.pem" ]; then
    log_warn "Certificates already exist at ${CERT_DIR}"
    read -p "Do you want to regenerate all certificates? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      log_info "Keeping existing certificates"
      exit 0
    fi

    log_warn "Backing up existing certificates..."
    backup_dir="${CERT_DIR}.backup.$(date +%Y%m%d-%H%M%S)"
    mv "${CERT_DIR}" "$backup_dir"
    log_info "Backed up to: $backup_dir"
  fi

  # Generate certificates
  generate_all_certificates

  # Verify certificates
  if verify_certificates; then
    log_info "Certificate generation completed successfully!"
  else
    log_error "Certificate generation completed with errors"
    exit 1
  fi

  # Display certificate information
  display_cert_info

  # Update .gitignore
  update_gitignore

  echo
  log_info "Next steps:"
  echo "  1. Update docker-compose.yml with certificate paths"
  echo "  2. Configure services to use mTLS"
  echo "  3. Test connections with: openssl s_client -connect <host>:<port> -cert client-cert.pem -key client-key.pem -CAfile ca-cert.pem"
  echo
  log_info "Certificate location: ${CERT_DIR}"
  log_warn "IMPORTANT: Never commit certificate private keys to git!"
}

main "$@"
