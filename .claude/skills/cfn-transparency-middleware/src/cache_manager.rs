// Cache Manager Module - LRU Cache Implementation
// Created with TDD approach

use std::collections::{HashMap, VecDeque};

#[derive(Debug, Clone)]
pub struct CacheManager {
    capacity: usize,
    map: HashMap<String, String>,
    order: VecDeque<String>,
}

impl CacheManager {
    /// Creates a new LRU cache with the specified capacity
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            map: HashMap::new(),
            order: VecDeque::new(),
        }
    }

    /// Gets a value from the cache by key, moving it to the most recently used position
    pub fn get(&mut self, key: &str) -> Option<&String> {
        if self.map.contains_key(key) {
            // Move key to the back (most recently used)
            self.order.retain(|k| k != key);
            self.order.push_back(key.to_string());
            self.map.get(key)
        } else {
            None
        }
    }

    /// Inserts a key-value pair into the cache, evicting the least recently used item if necessary
    pub fn insert(&mut self, key: String, value: String) -> Option<String> {
        // If capacity is 0, don't store anything
        if self.capacity == 0 {
            return None;
        }

        // If key already exists, update its value and move it to most recently used
        if self.map.contains_key(&key) {
            let old_value = self.map.get(&key).unwrap().clone();
            self.order.retain(|k| k != &key);
            self.order.push_back(key.clone());
            self.map.insert(key, value);
            return Some(old_value);
        }

        // If at capacity, remove least recently used item
        if self.map.len() >= self.capacity {
            if let Some(oldest_key) = self.order.pop_front() {
                self.map.remove(&oldest_key);
            }
        }

        // Insert new item
        self.order.push_back(key.clone());
        self.map.insert(key, value);
        None
    }

    /// Clears all items from the cache
    pub fn clear(&mut self) {
        self.map.clear();
        self.order.clear();
    }

    /// Returns the number of items in the cache
    pub fn len(&self) -> usize {
        self.map.len()
    }

    /// Returns true if the cache is empty
    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_cache() {
        let cache = CacheManager::new(3);
        assert_eq!(cache.len(), 0);
        assert!(cache.is_empty());
    }

    #[test]
    fn test_insert_and_get() {
        let mut cache = CacheManager::new(3);

        // Insert item
        assert_eq!(cache.insert("key1".to_string(), "value1".to_string()), None);
        assert_eq!(cache.len(), 1);
        assert!(!cache.is_empty());

        // Get item
        assert_eq!(cache.get("key1"), Some(&"value1".to_string()));

        // Get non-existent item
        assert_eq!(cache.get("nonexistent"), None);
    }

    #[test]
    fn test_insert_duplicate_key() {
        let mut cache = CacheManager::new(3);

        cache.insert("key1".to_string(), "value1".to_string());
        let old_value = cache.insert("key1".to_string(), "value1_updated".to_string());

        assert_eq!(old_value, Some("value1".to_string()));
        assert_eq!(cache.get("key1"), Some(&"value1_updated".to_string()));
        assert_eq!(cache.len(), 1);
    }

    #[test]
    fn test_lru_eviction() {
        let mut cache = CacheManager::new(2);

        // Fill cache to capacity
        cache.insert("key1".to_string(), "value1".to_string());
        cache.insert("key2".to_string(), "value2".to_string());

        // Access key1 to make it most recently used
        cache.get("key1");

        // Insert key3, should evict key2 (least recently used)
        cache.insert("key3".to_string(), "value3".to_string());

        assert_eq!(cache.get("key1"), Some(&"value1".to_string()));
        assert_eq!(cache.get("key2"), None);
        assert_eq!(cache.get("key3"), Some(&"value3".to_string()));
        assert_eq!(cache.len(), 2);
    }

    #[test]
    fn test_clear() {
        let mut cache = CacheManager::new(3);

        cache.insert("key1".to_string(), "value1".to_string());
        cache.insert("key2".to_string(), "value2".to_string());

        assert_eq!(cache.len(), 2);

        cache.clear();

        assert_eq!(cache.len(), 0);
        assert!(cache.is_empty());
        assert_eq!(cache.get("key1"), None);
        assert_eq!(cache.get("key2"), None);
    }

    #[test]
    fn test_update_moves_to_mru() {
        let mut cache = CacheManager::new(3);

        cache.insert("key1".to_string(), "value1".to_string());
        cache.insert("key2".to_string(), "value2".to_string());
        cache.insert("key3".to_string(), "value3".to_string());

        // Update key1, should move it to most recently used
        cache.insert("key1".to_string(), "value1_updated".to_string());

        // Fill with new items to test eviction order
        cache.insert("key4".to_string(), "value4".to_string());

        // key2 should be evicted (it was least recently used)
        assert_eq!(cache.get("key1"), Some(&"value1_updated".to_string()));
        assert_eq!(cache.get("key2"), None);
        assert_eq!(cache.get("key3"), Some(&"value3".to_string()));
        assert_eq!(cache.get("key4"), Some(&"value4".to_string()));
    }

    #[test]
    fn test_get_updates_order() {
        let mut cache = CacheManager::new(2);

        cache.insert("key1".to_string(), "value1".to_string());
        cache.insert("key2".to_string(), "value2".to_string());

        // Get key1, should move it to most recently used
        cache.get("key1");

        // Insert new item, should evict key2
        cache.insert("key3".to_string(), "value3".to_string());

        assert_eq!(cache.get("key1"), Some(&"value1".to_string()));
        assert_eq!(cache.get("key2"), None);
        assert_eq!(cache.get("key3"), Some(&"value3".to_string()));
    }

    #[test]
    fn test_zero_capacity() {
        let mut cache = CacheManager::new(0);

        cache.insert("key1".to_string(), "value1".to_string());

        assert_eq!(cache.len(), 0);
        assert_eq!(cache.get("key1"), None);
    }

    #[test]
    fn test_single_item_cache() {
        let mut cache = CacheManager::new(1);

        cache.insert("key1".to_string(), "value1".to_string());
        assert_eq!(cache.get("key1"), Some(&"value1".to_string()));

        cache.insert("key2".to_string(), "value2".to_string());

        assert_eq!(cache.get("key1"), None);
        assert_eq!(cache.get("key2"), Some(&"value2".to_string()));
        assert_eq!(cache.len(), 1);
    }
}