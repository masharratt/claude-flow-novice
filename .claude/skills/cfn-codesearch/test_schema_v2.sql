-- Test Schema v2 Design
.mode column
.headers on

-- Test 1: Create all tables
CREATE TABLE entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    signature TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    parent_id INTEGER,
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    column_number INTEGER,
    doc_comment TEXT,
    attributes TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    
    FOREIGN KEY (parent_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_entity_id INTEGER NOT NULL,
    target_entity_id INTEGER NOT NULL,
    ref_kind TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    column_number INTEGER,
    context TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    
    FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
    FOREIGN KEY (target_entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE type_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL,
    type_name TEXT NOT NULL,
    usage_kind TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    module_type TEXT NOT NULL,
    is_root BOOLEAN NOT NULL DEFAULT FALSE,
    parent_module_id INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    
    FOREIGN KEY (parent_module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE TABLE entity_embeddings (
    entity_id INTEGER PRIMARY KEY,
    embedding BLOB NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- Test 2: Insert sample data
INSERT INTO entities (kind, name, signature, visibility, file_path, line_number) VALUES 
('struct', 'MyStruct', 'struct MyStruct { field: i32 }', 'public', '/src/lib.rs', 10),
('function', 'my_function', 'fn my_function() -> Result<()>', 'public', '/src/lib.rs', 20),
('enum', 'MyEnum', 'enum MyEnum { A, B }', 'public', '/src/types.rs', 5);

-- Test 3: Insert reference
INSERT INTO refs (source_entity_id, target_entity_id, ref_kind, file_path, line_number)
VALUES (2, 1, 'reference', '/src/lib.rs', 21);

-- Test 4: Insert type usage
INSERT INTO type_usage (entity_id, type_name, usage_kind, file_path, line_number)
VALUES (2, 'MyStruct', 'parameter', '/src/lib.rs', 20);

-- Test 5: Test indexes
CREATE INDEX idx_entities_kind ON entities(kind);
CREATE INDEX idx_entities_name ON entities(name);
CREATE INDEX idx_entities_file_path ON entities(file_path);
CREATE INDEX idx_entities_kind_name ON entities(kind, name);
CREATE INDEX idx_entities_file_kind ON entities(file_path, kind);

CREATE INDEX idx_refs_source ON refs(source_entity_id);
CREATE INDEX idx_refs_target ON refs(target_entity_id);
CREATE INDEX idx_refs_kind ON refs(ref_kind);

CREATE INDEX idx_type_usage_type_name ON type_usage(type_name);
CREATE INDEX idx_type_usage_type_kind ON type_usage(type_name, usage_kind);

-- Test 6: Performance queries
SELECT 'Query 1: Find struct by name' as test;
EXPLAIN QUERY PLAN 
SELECT e.* FROM entities e 
WHERE e.kind = 'struct' AND e.name = 'MyStruct'
LIMIT 1;

SELECT 'Query 2: List entities in file' as test;
EXPLAIN QUERY PLAN
SELECT e.* FROM entities e
WHERE e.file_path = '/src/lib.rs'
ORDER BY e.line_number;

SELECT 'Query 3: Find references from entity' as test;
EXPLAIN QUERY PLAN
SELECT r.*, e.name as target_name
FROM refs r
JOIN entities e ON r.target_entity_id = e.id
WHERE r.source_entity_id = 2;

SELECT 'Query 4: Find entities using type' as test;
EXPLAIN QUERY PLAN
SELECT DISTINCT e.*
FROM type_usage tu
JOIN entities e ON tu.entity_id = e.id
WHERE tu.type_name = 'MyStruct';

-- Test 7: Verify foreign keys
PRAGMA foreign_key_check;

-- Test 8: Get statistics
SELECT 
    'entities' as table_name, COUNT(*) as count FROM entities
UNION ALL
SELECT 
    'refs' as table_name, COUNT(*) as count FROM refs
UNION ALL
SELECT 
    'type_usage' as table_name, COUNT(*) as count FROM type_usage
UNION ALL
SELECT 
    'modules' as table_name, COUNT(*) as count FROM modules
UNION ALL
SELECT 
    'entity_embeddings' as table_name, COUNT(*) as count FROM entity_embeddings;

SELECT 'Schema v2 test completed successfully' as result;
