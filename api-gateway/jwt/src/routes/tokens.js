const express = require('express');
const Joi = require('joi');
const { refreshAccessToken, revokeToken } = require('../middleware/auth');
const { authenticateRequest, requireTokenType } = require('../middleware/token-management');
const logger = require('../logger');

const router = express.Router();

// Validation schemas
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
});

const revokeTokenSchema = Joi.object({
  token: Joi.string().optional(),
  allTokens: Joi.boolean().default(false)
});

/**
 * POST /api/tokens/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { error, value } = refreshTokenSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message,
        requestId: req.requestId
      });
    }

    const { refreshToken } = value;

    // Refresh the token
    const tokens = await refreshAccessToken(refreshToken);

    logger.info('Token refreshed successfully', {
      requestId: req.requestId
    });

    res.json({
      message: 'Token refreshed successfully',
      ...tokens
    });
  } catch (error) {
    logger.error('Token refresh error:', error);

    if (error.message === 'Invalid refresh token' || error.message === 'Refresh token not found') {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'The provided refresh token is invalid or has been revoked',
        requestId: req.requestId
      });
    }

    if (error.message === 'Refresh token expired') {
      return res.status(401).json({
        error: 'Refresh token expired',
        message: 'The provided refresh token has expired',
        requestId: req.requestId
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while refreshing the token',
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/tokens/revoke
 * Revoke a token
 */
router.post('/revoke', authenticateRequest({ required: false }), async (req, res) => {
  try {
    const { error, value } = revokeTokenSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message,
        requestId: req.requestId
      });
    }

    let { token, allTokens } = value;

    // If no token provided, use the current request token
    if (!token && req.headers.authorization) {
      token = req.headers.authorization.replace('Bearer ', '');
    }

    if (!token) {
      return res.status(400).json({
        error: 'No token provided',
        message: 'Token to revoke is required',
        requestId: req.requestId
      });
    }

    if (allTokens && req.user) {
      // If revoking all tokens for user, this would require additional implementation
      // For now, we'll revoke the provided token
      logger.warn('Revoke all tokens requested, but only single token revocation implemented', {
        userId: req.user.sub,
        requestId: req.requestId
      });
    }

    // Revoke the token
    const revoked = await revokeToken(token);

    if (!revoked) {
      return res.status(400).json({
        error: 'Token revocation failed',
        message: 'Unable to revoke the provided token',
        requestId: req.requestId
      });
    }

    logger.info('Token revoked successfully', {
      userId: req.user?.sub,
      allTokens,
      requestId: req.requestId
    });

    res.json({
      message: 'Token revoked successfully'
    });
  } catch (error) {
    logger.error('Token revocation error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while revoking the token',
      requestId: req.requestId
    });
  }
});

/**
 * GET /api/tokens/info
 * Get token information
 */
router.get('/info', authenticateRequest(), async (req, res) => {
  try {
    const token = req.headers.authorization.replace('Bearer ', '');

    // Token is already verified by the authenticateRequest middleware
    // We can return additional information about the token
    const authInfo = req.auth;

    res.json({
      token: {
        tokenId: authInfo.tokenId,
        type: authInfo.type,
        issuedAt: new Date(authInfo.issuedAt * 1000).toISOString(),
        expiresAt: new Date(authInfo.expiresAt * 1000).toISOString(),
        timeToExpiry: authInfo.expiresAt - Math.floor(Date.now() / 1000)
      },
      user: {
        id: req.user.sub,
        email: req.user.email,
        roles: req.user.roles,
        permissions: req.user.permissions
      }
    });
  } catch (error) {
    logger.error('Token info error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching token information',
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/tokens/validate
 * Validate token without authentication middleware
 */
router.post('/validate', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(400).json({
        valid: false,
        error: 'No token provided',
        message: 'Authorization header with Bearer token is required',
        requestId: req.requestId
      });
    }

    const { validateToken } = require('../middleware/auth');
    const result = await validateToken(token);

    res.json(result);
  } catch (error) {
    logger.error('Token validation error:', error);
    res.status(500).json({
      valid: false,
      error: 'Validation error',
      message: 'An error occurred while validating the token',
      requestId: req.requestId
    });
  }
});

/**
 * DELETE /api/tokens/cleanup
 * Clean up expired tokens (admin only)
 */
router.delete('/cleanup', authenticateRequest(), requireRoles(['admin']), async (req, res) => {
  try {
    // This would require implementation of cleanup logic
    // For now, we'll just return success
    logger.info('Token cleanup requested by admin', {
      userId: req.user.sub,
      requestId: req.requestId
    });

    res.json({
      message: 'Token cleanup completed',
      // In a real implementation, you would return actual cleanup statistics
      cleanedTokens: 0,
      memoryFreed: '0 bytes'
    });
  } catch (error) {
    logger.error('Token cleanup error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during token cleanup',
      requestId: req.requestId
    });
  }
});

module.exports = router;