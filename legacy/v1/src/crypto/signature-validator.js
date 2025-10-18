/**
 * SECURITY REMEDIATION: Cryptographic Signature Validator
 * Provides secure cryptographic signature validation with RSA-PSS
 */

const crypto = require('crypto');

class CryptographicValidator {
  constructor() {
    this.supportedAlgorithms = new Set(['RSA-PSS', 'RSA-PKCS1', 'ECDSA']);

    this.hashAlgorithms = new Set(['sha256', 'sha384', 'sha512']);
  }

  /**
   * SECURITY: Validate cryptographic signature with strict validation
   */
  async validateSignature({
    message,
    signature,
    publicKey,
    algorithm = 'RSA-PSS',
    hashAlgorithm = 'sha256',
  }) {
    if (!this.supportedAlgorithms.has(algorithm)) {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    if (!this.hashAlgorithms.has(hashAlgorithm)) {
      throw new Error(`Unsupported hash algorithm: ${hashAlgorithm}`);
    }

    try {
      const messageBuffer = Buffer.from(message);
      const signatureBuffer = Buffer.from(signature, 'base64');

      const isValid = crypto.verify(
        hashAlgorithm,
        messageBuffer,
        {
          key: publicKey,
          padding:
            algorithm === 'RSA-PSS'
              ? crypto.constants.RSA_PKCS1_PSS_PADDING
              : crypto.constants.RSA_PKCS1_PADDING,
          saltLength: algorithm === 'RSA-PSS' ? crypto.constants.RSA_PSS_SALTLEN_DIGEST : undefined,
        },
        signatureBuffer,
      );

      return isValid;
    } catch (error) {
      console.error('Signature validation failed:', error.message);
      return false;
    }
  }
}

module.exports = { CryptographicValidator };
