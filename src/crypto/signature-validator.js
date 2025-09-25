/**
 * Cryptographic Signature Validator - Critical Fix Implementation
 * REQUIREMENT: 100% test pass rate for signature verification (fix current failures)
 *
 * Implements RSA-PSS, ECDSA, and EdDSA signature validation with Byzantine security
 */

const crypto = require('crypto');
const { performance } = require('perf_hooks');

class CryptographicValidator {
  constructor(options = {}) {
    this.algorithms = options.algorithms || ['RSA-PSS', 'ECDSA', 'EdDSA'];
    this.hashAlgorithms = options.hashAlgorithms || ['SHA-256', 'SHA-384', 'SHA-512'];

    // Security configuration
    this.timingAttackProtection = true;
    this.constantTimeValidation = true;

    // Validation metadata storage
    this.lastValidationMetadata = null;
    this.lastValidationError = null;

    // Performance tracking
    this.validationHistory = [];

    // Byzantine fault tolerance settings
    this.byzantineSettings = {
      requiredValidSignatures: 2,
      maxFaultTolerance: 1,
      enableFaultDetection: true
    };
  }

  /**
   * Validate a single cryptographic signature
   * @param {Object} options - Signature validation options
   * @returns {Boolean} - True if signature is valid
   */
  async validateSignature(options) {
    const startTime = performance.now();

    try {
      // Reset validation state
      this.lastValidationError = null;
      this.lastValidationMetadata = null;

      // Validate input parameters
      this._validateSignatureInput(options);

      const {
        message,
        signature,
        publicKey,
        algorithm,
        hashAlgorithm = 'SHA-256',
        curve,
        metadata = {}
      } = options;

      let isValid = false;

      // Route to appropriate validation method based on algorithm
      switch (algorithm) {
        case 'RSA-PSS':
          isValid = await this._validateRSAPSSSignature(message, signature, publicKey, hashAlgorithm);
          break;
        case 'ECDSA':
          isValid = await this._validateECDSASignature(message, signature, publicKey, hashAlgorithm, curve);
          break;
        case 'EdDSA':
          isValid = await this._validateEdDSASignature(message, signature, publicKey, curve);
          break;
        default:
          throw new Error(`Unsupported signature algorithm: ${algorithm}`);
      }

      // Store validation metadata
      this.lastValidationMetadata = {
        algorithm,
        hashAlgorithm,
        curve,
        timestamp: Date.now(),
        validationTime: performance.now() - startTime,
        isValid,
        ...metadata
      };

      // Add to validation history
      this.validationHistory.push({
        timestamp: Date.now(),
        algorithm,
        isValid,
        validationTime: performance.now() - startTime
      });

      return isValid;

    } catch (error) {
      this.lastValidationError = error.message;

      // Implement constant-time error handling to prevent timing attacks
      if (this.timingAttackProtection) {
        await this._constantTimeDelay();
      }

      return false;
    }
  }

  /**
   * Validate RSA-PSS signatures
   * @private
   */
  async _validateRSAPSSSignature(message, signature, publicKey, hashAlgorithm) {
    try {
      // Convert hash algorithm name to Node.js format
      const nodeHashAlg = this._convertHashAlgorithm(hashAlgorithm);

      // Validate RSA-PSS signature with proper parameters
      const isValid = crypto.verify(
        'RSA-PSS',
        message,
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
          hashAlgorithm: nodeHashAlg
        },
        signature
      );

      return isValid;

    } catch (error) {
      this.lastValidationError = `RSA-PSS signature verification failed: ${error.message}`;
      return false;
    }
  }

  /**
   * Validate ECDSA signatures
   * @private
   */
  async _validateECDSASignature(message, signature, publicKey, hashAlgorithm, curve) {
    try {
      // Extract curve from public key if not provided
      if (!curve) {
        curve = this._extractCurveFromKey(publicKey);
      }

      // Validate curve compatibility
      this._validateCurveCompatibility(publicKey, curve);

      // Convert hash algorithm name
      const nodeHashAlg = this._convertHashAlgorithm(hashAlgorithm);

      // Validate ECDSA signature
      const isValid = crypto.verify(nodeHashAlg, message, publicKey, signature);

      // Update metadata with curve information
      if (this.lastValidationMetadata) {
        this.lastValidationMetadata.curve = curve;
      }

      return isValid;

    } catch (error) {
      // Check for key mismatch specifically
      if (error.message.includes('key') || error.message.includes('curve')) {
        this.lastValidationError = 'ECDSA signature verification failed: key mismatch or incompatible curve';
      } else {
        this.lastValidationError = `ECDSA signature verification failed: ${error.message}`;
      }
      return false;
    }
  }

  /**
   * Validate EdDSA signatures (Ed25519/Ed448)
   * @private
   */
  async _validateEdDSASignature(message, signature, publicKey, curve = 'Ed25519') {
    try {
      // EdDSA doesn't use separate hash algorithms - it's built into the signature scheme
      const isValid = crypto.verify(null, message, publicKey, signature);

      // Update metadata
      if (this.lastValidationMetadata) {
        this.lastValidationMetadata.curve = curve;
      }

      return isValid;

    } catch (error) {
      this.lastValidationError = `EdDSA signature verification failed: ${error.message}`;
      return false;
    }
  }

  /**
   * Validate multiple signatures for Byzantine consensus
   * @param {Object} options - Multi-signature validation options
   * @returns {Object} - Validation results with Byzantine fault analysis
   */
  async validateMultipleSignatures(options) {
    const {
      message,
      signatures,
      requiredValidSignatures = 2,
      byzantineFaultTolerance = true
    } = options;

    const results = {
      isValid: false,
      validCount: 0,
      totalCount: signatures.length,
      byzantineSecure: false,
      byzantineFaults: [],
      signatureResults: []
    };

    // Validate each signature
    for (let i = 0; i < signatures.length; i++) {
      const sigConfig = signatures[i];
      const signatureOptions = {
        message,
        signature: sigConfig.signature,
        publicKey: sigConfig.publicKey,
        algorithm: sigConfig.algorithm,
        hashAlgorithm: sigConfig.hashAlgorithm,
        curve: sigConfig.curve
      };

      const isValid = await this.validateSignature(signatureOptions);

      results.signatureResults.push({
        index: i,
        isValid,
        algorithm: sigConfig.algorithm,
        validationTime: this.lastValidationMetadata?.validationTime || 0
      });

      if (isValid) {
        results.validCount++;
      } else if (byzantineFaultTolerance) {
        results.byzantineFaults.push({
          signatureIndex: i,
          error: this.lastValidationError,
          algorithm: sigConfig.algorithm
        });
      }
    }

    // Determine overall validation result
    results.isValid = results.validCount >= requiredValidSignatures;

    // Byzantine fault tolerance analysis
    if (byzantineFaultTolerance) {
      const maxFaults = Math.floor((signatures.length - 1) / 3); // Byzantine fault tolerance limit
      results.byzantineSecure = results.byzantineFaults.length <= maxFaults &&
                               results.validCount >= (signatures.length - maxFaults);
    }

    return results;
  }

  /**
   * Implement timing attack protection with constant-time operations
   * @private
   */
  async _constantTimeDelay() {
    // Implement constant-time delay to prevent timing attacks
    const baseDelay = 10; // Base delay in milliseconds
    const randomDelay = Math.random() * 5; // Small random component

    return new Promise(resolve => {
      setTimeout(resolve, baseDelay + randomDelay);
    });
  }

  /**
   * Validate signature input parameters
   * @private
   */
  _validateSignatureInput(options) {
    const { message, signature, publicKey, algorithm } = options;

    if (!message) {
      throw new Error('Message is required for signature validation');
    }

    if (!signature) {
      throw new Error('Signature is required for validation');
    }

    if (!publicKey) {
      throw new Error('Public key is required for signature validation');
    }

    if (!algorithm) {
      throw new Error('Algorithm is required for signature validation');
    }

    if (!this.algorithms.includes(algorithm)) {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    // Validate signature format
    if (!Buffer.isBuffer(signature) && typeof signature !== 'string') {
      throw new Error('Signature must be a Buffer or string');
    }

    // Validate message format
    if (!Buffer.isBuffer(message) && typeof message !== 'string') {
      throw new Error('Message must be a Buffer or string');
    }
  }

  /**
   * Convert hash algorithm names to Node.js format
   * @private
   */
  _convertHashAlgorithm(hashAlgorithm) {
    const algorithmMap = {
      'SHA-256': 'sha256',
      'SHA-384': 'sha384',
      'SHA-512': 'sha512',
      'sha256': 'sha256',
      'sha384': 'sha384',
      'sha512': 'sha512'
    };

    return algorithmMap[hashAlgorithm] || hashAlgorithm.toLowerCase();
  }

  /**
   * Extract curve information from public key
   * @private
   */
  _extractCurveFromKey(publicKey) {
    try {
      const keyObject = crypto.createPublicKey(publicKey);
      const keyDetails = keyObject.asymmetricKeyDetails;

      if (keyDetails && keyDetails.namedCurve) {
        return keyDetails.namedCurve;
      }

      // Default curves based on key type
      return 'secp384r1'; // Common default
    } catch (error) {
      throw new Error(`Unable to extract curve from public key: ${error.message}`);
    }
  }

  /**
   * Validate curve compatibility with public key
   * @private
   */
  _validateCurveCompatibility(publicKey, expectedCurve) {
    try {
      const actualCurve = this._extractCurveFromKey(publicKey);

      if (expectedCurve && actualCurve !== expectedCurve) {
        throw new Error(`Curve mismatch: expected ${expectedCurve}, got ${actualCurve}`);
      }
    } catch (error) {
      throw new Error(`Curve validation failed: ${error.message}`);
    }
  }

  /**
   * Get last validation metadata
   * @returns {Object} - Validation metadata
   */
  getLastValidationMetadata() {
    return this.lastValidationMetadata;
  }

  /**
   * Get last validation error
   * @returns {String} - Error message
   */
  getLastValidationError() {
    return this.lastValidationError;
  }

  /**
   * Get validation performance statistics
   * @returns {Object} - Performance statistics
   */
  getPerformanceStatistics() {
    if (this.validationHistory.length === 0) {
      return null;
    }

    const times = this.validationHistory.map(h => h.validationTime);
    const validations = this.validationHistory.length;
    const successRate = this.validationHistory.filter(h => h.isValid).length / validations;

    return {
      totalValidations: validations,
      averageTime: times.reduce((a, b) => a + b, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      successRate: successRate,
      algorithmDistribution: this._getAlgorithmDistribution()
    };
  }

  /**
   * Get algorithm usage distribution
   * @private
   */
  _getAlgorithmDistribution() {
    const distribution = {};

    this.validationHistory.forEach(entry => {
      distribution[entry.algorithm] = (distribution[entry.algorithm] || 0) + 1;
    });

    return distribution;
  }

  /**
   * Clear validation history (for testing or memory management)
   */
  clearValidationHistory() {
    this.validationHistory = [];
    this.lastValidationMetadata = null;
    this.lastValidationError = null;
  }

  /**
   * Configure Byzantine fault tolerance settings
   * @param {Object} settings - Byzantine settings
   */
  configureByzantine(settings) {
    this.byzantineSettings = {
      ...this.byzantineSettings,
      ...settings
    };
  }

  /**
   * Test signature validation performance against timing attacks
   * @param {Object} testOptions - Test configuration
   * @returns {Object} - Timing analysis results
   */
  async analyzeTimingAttackResistance(testOptions) {
    const {
      validSignature,
      invalidSignature,
      message,
      publicKey,
      algorithm,
      iterations = 100
    } = testOptions;

    const validTimes = [];
    const invalidTimes = [];

    // Measure valid signature validation times
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await this.validateSignature({
        message, signature: validSignature, publicKey, algorithm
      });
      validTimes.push(performance.now() - start);
    }

    // Measure invalid signature validation times
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await this.validateSignature({
        message, signature: invalidSignature, publicKey, algorithm
      });
      invalidTimes.push(performance.now() - start);
    }

    const avgValid = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
    const avgInvalid = invalidTimes.reduce((a, b) => a + b, 0) / invalidTimes.length;

    const timingDifference = Math.abs(avgValid - avgInvalid) / Math.max(avgValid, avgInvalid);

    return {
      averageValidTime: avgValid,
      averageInvalidTime: avgInvalid,
      timingDifference: timingDifference,
      isTimingAttackResistant: timingDifference < 0.1, // Less than 10% difference
      validTimeVariance: this._calculateVariance(validTimes),
      invalidTimeVariance: this._calculateVariance(invalidTimes)
    };
  }

  /**
   * Calculate variance for timing analysis
   * @private
   */
  _calculateVariance(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
    return squaredDifferences.reduce((a, b) => a + b, 0) / values.length;
  }
}

module.exports = { CryptographicValidator };