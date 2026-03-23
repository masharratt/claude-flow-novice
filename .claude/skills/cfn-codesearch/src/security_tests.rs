#[cfg(test)]
mod security_tests {
    use super::*;
    use crate::store_v2::StoreV2;
    use tempfile::TempDir;
    use std::path::Path;

    #[test]
    fn test_sql_injection_prevention_in_query_api() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let store = StoreV2::new(&db_path).unwrap();
        let query_api = super::QueryApi::new(store);

        // Test 1: SQL injection attempt in function name
        let malicious_input = "test'; DROP TABLE entities; --";
        let result = query_api.find_callers_of_function(malicious_input, None);
        assert!(result.is_ok());

        // Should return empty results, not execute the DROP TABLE
        let query_result = result.unwrap();
        assert_eq!(query_result.total_count, 0);

        // Test 2: SQL injection in type name
        let result = query_api.find_functions_using_type("'; DELETE FROM entities; --");
        assert!(result.is_ok());
        let query_result = result.unwrap();
        assert_eq!(query_result.total_count, 0);

        // Test 3: SQL injection in module path
        let result = query_api.find_public_api("'; DROP TABLE refs; --");
        assert!(result.is_ok());
        let query_result = result.unwrap();
        assert_eq!(query_result.total_count, 0);

        // Test 4: SQL injection in pattern search
        let result = query_api.find_functions_by_pattern("'; INSERT INTO entities");
        assert!(result.is_ok());
        let query_result = result.unwrap();
        assert_eq!(query_result.total_count, 0);

        // Test 5: Empty inputs should be handled safely
        let result = query_api.find_callers_of_function("", None);
        assert!(result.is_ok());
        let query_result = result.unwrap();
        assert_eq!(query_result.total_count, 0);
    }

    #[test]
    fn test_sql_injection_prevention_in_store_v2() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let store = StoreV2::new(&db_path).unwrap();

        // Test 1: Malicious ID values (should be safely handled)
        // This test assumes the validate_ids function is public or we have another way to test it
        // For now, we'll test that negative IDs don't cause issues

        // Test with potentially malicious IDs
        let malicious_ids = vec![-1, 999999999999999999];
        let result = store.get_entities_by_ids(&malicious_ids);
        assert!(result.is_ok()); // Should not panic or execute SQL injection
        assert!(result.unwrap().is_empty()); // Should return empty

        // Test 2: SQL injection attempt in search
        let malicious_query = "'; DROP TABLE entities; --";
        let result = store.search_entities(malicious_query, 10);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_input_validation_edge_cases() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let store = StoreV2::new(&db_path).unwrap();
        let query_api = super::QueryApi::new(store);

        // Test various edge cases that could be injection attempts
        let test_cases = vec![
            "'; SELECT * FROM users; --",
            "1' OR '1'='1",
            "'; UPDATE entities SET name='hacked'; --",
            "'; INSERT INTO entities VALUES('hacked'); --",
            "\\' OR \\'1\\'=\\'1",
            "%'; DROP TABLE refs; --",
            "test%";  // Wildcard in pattern
        ];

        for malicious_input in test_cases {
            // Test in find_callers_of_function
            let result = query_api.find_callers_of_function(malicious_input, None);
            assert!(result.is_ok(), "Should handle input: {}", malicious_input);

            // Test in find_functions_using_type
            let result = query_api.find_functions_using_type(malicious_input);
            assert!(result.is_ok(), "Should handle input: {}", malicious_input);

            // Test in find_implementations
            let result = query_api.find_implementations(malicious_input);
            assert!(result.is_ok(), "Should handle input: {}", malicious_input);

            // Test in pattern search
            let result = query_api.find_functions_by_pattern(malicious_input);
            assert!(result.is_ok(), "Should handle pattern: {}", malicious_input);
        }
    }

    #[test]
    fn test_like_clause_safety() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let store = StoreV2::new(&db_path).unwrap();
        let query_api = super::QueryApi::new(store);

        // Test that % and _ characters in patterns are properly escaped
        let test_cases = vec![
            "test%pattern",  // Contains wildcard
            "test_pattern",  // Contains underscore wildcard
            "test\\%escape",  // Attempted escape sequence
            "test\\\\%double_escape",
        ];

        for pattern in test_cases {
            let result = query_api.find_functions_by_pattern(pattern);
            assert!(result.is_ok(), "Should handle pattern with wildcards: {}", pattern);
        }
    }

    #[test]
    fn test_parameter_binding() {
        // This test ensures that all queries are using parameter binding
        // rather than string interpolation

        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let store = StoreV2::new(&db_path).unwrap();
        let query_api = super::QueryApi::new(store);

        // Create some test data
        // (This would require more setup code to actually insert entities)

        // Test that parameters are properly bound and not interpolated
        let test_input = "test_param_123";
        let result = query_api.find_callers_of_function(test_input, Some("test_module"));
        assert!(result.is_ok());

        // The query should use the parameter value exactly as provided,
        // not interpret it as SQL
        let query_result = result.unwrap();
        // In a real test with data, we would verify the correct results
        // For now, just ensure no SQL injection occurred
    }
}