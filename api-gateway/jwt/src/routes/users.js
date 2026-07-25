const express = require('express');
const { authenticateRequest } = require('../middleware/auth');
const logger = require('../logger');

const router = express.Router();

// Mock user data (in production, this would come from a database)
const users = [
  {
    id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'admin-user-456',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// Get user profile
router.get('/profile', authenticateRequest, (req, res) => {
  try {
    const user = users.find(u => u.id === req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User profile not found'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve user profile'
    });
  }
});

// Get user by ID (admin only)
router.get('/:userId', authenticateRequest, (req, res) => {
  try {
    // Check if user is admin or requesting their own profile
    if (req.user.role !== 'admin' && req.user.userId !== req.params.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only access your own profile'
      });
    }
    
    const user = users.find(u => u.id === req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve user'
    });
  }
});

// Update user profile
router.put('/profile', authenticateRequest, (req, res) => {
  try {
    const { name, email } = req.body;
    const userIndex = users.findIndex(u => u.id === req.user.userId);
    
    if (userIndex === -1) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User profile not found'
      });
    }
    
    // Update user data
    if (name) users[userIndex].name = name;
    if (email) users[userIndex].email = email;
    users[userIndex].updatedAt = new Date().toISOString();
    
    const updatedUser = users[userIndex];
    
    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        updatedAt: updatedUser.updatedAt
      }
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update user profile'
    });
  }
});

// List all users (admin only)
router.get('/', authenticateRequest, (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin access required'
      });
    }
    
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;
    
    let filteredUsers = users;
    
    // Apply search filter
    if (search) {
      const searchTerm = search.toLowerCase();
      filteredUsers = users.filter(user => 
        user.name.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm)
      );
    }
    
    // Apply pagination
    const paginatedUsers = filteredUsers.slice(offset, offset + parseInt(limit));
    
    res.json({
      success: true,
      users: paginatedUsers.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: filteredUsers.length,
        pages: Math.ceil(filteredUsers.length / limit)
      }
    });
  } catch (error) {
    logger.error('List users error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve users'
    });
  }
});

// Delete user (admin only)
router.delete('/:userId', authenticateRequest, (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin access required'
      });
    }
    
    const userIndex = users.findIndex(u => u.id === req.params.userId);
    
    if (userIndex === -1) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found'
      });
    }
    
    // Remove user
    const deletedUser = users.splice(userIndex, 1)[0];
    
    res.json({
      success: true,
      message: 'User deleted successfully',
      user: {
        id: deletedUser.id,
        email: deletedUser.email,
        name: deletedUser.name
      }
    });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete user'
    });
  }
});

module.exports = router;