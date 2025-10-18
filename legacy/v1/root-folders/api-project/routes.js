const express = require('express');
const { ItemModel } = require('./models');

const router = express.Router();

// GET /api/items - Get all items
router.get('/items', (req, res) => {
  try {
    const items = ItemModel.getAll();
    res.json({
      success: true,
      data: items,
      count: items.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch items',
      message: error.message
    });
  }
});

// GET /api/items/:id - Get item by ID
router.get('/items/:id', (req, res) => {
  try {
    const item = ItemModel.getById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }
    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch item',
      message: error.message
    });
  }
});

// POST /api/items - Create new item
router.post('/items', (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      });
    }
    
    const newItem = ItemModel.create({ name, description });
    res.status(201).json({
      success: true,
      data: newItem,
      message: 'Item created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create item',
      message: error.message
    });
  }
});

// PUT /api/items/:id - Update item
router.put('/items/:id', (req, res) => {
  try {
    const { name, description } = req.body;
    const updateData = {};
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    
    const updatedItem = ItemModel.update(req.params.id, updateData);
    if (!updatedItem) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }
    
    res.json({
      success: true,
      data: updatedItem,
      message: 'Item updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update item',
      message: error.message
    });
  }
});

// DELETE /api/items/:id - Delete item
router.delete('/items/:id', (req, res) => {
  try {
    const deleted = ItemModel.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Item deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete item',
      message: error.message
    });
  }
});

module.exports = router;