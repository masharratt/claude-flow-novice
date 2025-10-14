let nextId = 1;

// In-memory storage for simplicity
const items = [
  { id: nextId++, name: 'Sample Item', description: 'This is a sample item', createdAt: new Date().toISOString() }
];

class ItemModel {
  static getAll() {
    return items;
  }

  static getById(id) {
    return items.find(item => item.id === parseInt(id));
  }

  static create(data) {
    const newItem = {
      id: nextId++,
      name: data.name,
      description: data.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    items.push(newItem);
    return newItem;
  }

  static update(id, data) {
    const itemIndex = items.findIndex(item => item.id === parseInt(id));
    if (itemIndex === -1) {
      return null;
    }
    
    items[itemIndex] = {
      ...items[itemIndex],
      ...data,
      updatedAt: new Date().toISOString()
    };
    
    return items[itemIndex];
  }

  static delete(id) {
    const itemIndex = items.findIndex(item => item.id === parseInt(id));
    if (itemIndex === -1) {
      return false;
    }
    
    items.splice(itemIndex, 1);
    return true;
  }
}

module.exports = { ItemModel };