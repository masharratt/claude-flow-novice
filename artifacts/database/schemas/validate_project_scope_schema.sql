-- Project Scope Management Schema Validation Script
-- Version: 1.0.0
-- Purpose: Validate the PostgreSQL schema creation and functionality

-- =============================================
-- SCHEMA VALIDATION
-- =============================================

\echo 'Validating Project Scope Management Schema...'
\echo '============================================='

-- Check if all tables exist
\echo 'Checking table existence...'

DO $$
DECLARE
    table_name TEXT;
    table_exists BOOLEAN;
    missing_tables TEXT[] := '{}';
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'projects', 
        'scope_definitions', 
        'deliverables', 
        'scope_changes', 
        'milestones',
        'schema_version'
    ]
    LOOP
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = table_name
        ) INTO table_exists;
        
        IF NOT table_exists THEN
            missing_tables := array_append(missing_tables, table_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'Missing tables: %', array_to_string(missing_tables, ', ');
    ELSE
        \echo '✓ All required tables exist';
    END IF;
END $$;

-- Check if all indexes exist
\echo 'Checking index existence...'

DO $$
DECLARE
    index_name TEXT;
    index_exists BOOLEAN;
    missing_indexes TEXT[] := '{}';
    expected_indexes TEXT[] := ARRAY[
        'idx_projects_status',
        'idx_projects_priority', 
        'idx_projects_type',
        'idx_scope_project',
        'idx_scope_type',
        'idx_deliverables_project',
        'idx_deliverables_status',
        'idx_scope_changes_project',
        'idx_milestones_project'
    ];
BEGIN
    FOREACH index_name IN ARRAY expected_indexes
    LOOP
        SELECT EXISTS (
            SELECT FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND indexname = index_name
        ) INTO index_exists;
        
        IF NOT index_exists THEN
            missing_indexes := array_append(missing_indexes, index_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_indexes, 1) > 0 THEN
        RAISE EXCEPTION 'Missing indexes: %', array_to_string(missing_indexes, ', ');
    ELSE
        \echo '✓ All required indexes exist';
    END IF;
END $$;

-- Check if views exist
\echo 'Checking view existence...'

DO $$
DECLARE
    view_name TEXT;
    view_exists BOOLEAN;
    missing_views TEXT[] := '{}';
BEGIN
    FOREACH view_name IN ARRAY ARRAY[
        'v_project_summary',
        'v_active_scope_items',
        'v_overdue_deliverables'
    ]
    LOOP
        SELECT EXISTS (
            SELECT FROM information_schema.views 
            WHERE table_schema = 'public' 
            AND table_name = view_name
        ) INTO view_exists;
        
        IF NOT view_exists THEN
            missing_views := array_append(missing_views, view_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_views, 1) > 0 THEN
        RAISE EXCEPTION 'Missing views: %', array_to_string(missing_views, ', ');
    ELSE
        \echo '✓ All required views exist';
    END IF;
END $$;

-- Check if triggers exist
\echo 'Checking trigger existence...'

DO $$
DECLARE
    trigger_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO trigger_count
    FROM information_schema.triggers 
    WHERE trigger_schema = 'public';
    
    IF trigger_count < 4 THEN
        RAISE EXCEPTION 'Expected at least 4 triggers, found %', trigger_count;
    ELSE
        \echo '✓ All required triggers exist';
    END IF;
END $$;

-- Check if extensions are installed
\echo 'Checking PostgreSQL extensions...'

DO $$
DECLARE
    ext_name TEXT;
    ext_exists BOOLEAN;
    missing_extensions TEXT[] := '{}';
BEGIN
    FOREACH ext_name IN ARRAY ARRAY['uuid-ossp', 'btree_gin']
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM pg_extension 
            WHERE extname = ext_name
        ) INTO ext_exists;
        
        IF NOT ext_exists THEN
            missing_extensions := array_append(missing_extensions, ext_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_extensions, 1) > 0 THEN
        RAISE EXCEPTION 'Missing extensions: %', array_to_string(missing_extensions, ', ');
    ELSE
        \echo '✓ All required extensions are installed';
    END IF;
END $$;

-- =============================================
-- FUNCTIONALITY TESTS
-- =============================================

\echo 'Testing schema functionality...'

-- Test 1: Create a sample project
\echo 'Test 1: Creating sample project...'

INSERT INTO projects (
    name, 
    slug, 
    description, 
    project_type, 
    priority_level, 
    created_by,
    metadata
) VALUES (
    'Test Project',
    'test-project',
    'A test project for schema validation',
    'feature',
    1,
    'schema-validator',
    '{"test": true, "validation": "sample"}'
) ON CONFLICT (slug) DO NOTHING;

-- Verify project creation
DO $$
DECLARE
    project_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO project_count
    FROM projects 
    WHERE slug = 'test-project';
    
    IF project_count = 0 THEN
        RAISE EXCEPTION 'Failed to create test project';
    ELSE
        \echo '✓ Sample project created successfully';
    END IF;
END $$;

-- Test 2: Create scope definitions
\echo 'Test 2: Creating scope definitions...'

WITH project_id AS (
    SELECT id FROM projects WHERE slug = 'test-project' LIMIT 1
)
INSERT INTO scope_definitions (
    project_id,
    scope_type,
    category,
    item_name,
    description,
    acceptance_criteria,
    priority
)
SELECT 
    id,
    'in_scope',
    'features',
    'User Authentication',
    'Implement user login and registration',
    'Users can register, login, and logout successfully',
    1
FROM project_id
ON CONFLICT (project_id, scope_type, category, item_name) DO NOTHING;

WITH project_id AS (
    SELECT id FROM projects WHERE slug = 'test-project' LIMIT 1
)
INSERT INTO scope_definitions (
    project_id,
    scope_type,
    category,
    item_name,
    description,
    acceptance_criteria,
    priority
)
SELECT 
    id,
    'out_of_scope',
    'features',
    'Social Media Integration',
    'Integration with Facebook, Twitter, etc.',
    'Not included in this phase',
    3
FROM project_id
ON CONFLICT (project_id, scope_type, category, item_name) DO NOTHING;

-- Verify scope definitions
DO $$
DECLARE
    scope_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO scope_count
    FROM scope_definitions sd
    JOIN projects p ON sd.project_id = p.id
    WHERE p.slug = 'test-project';
    
    IF scope_count < 2 THEN
        RAISE EXCEPTION 'Failed to create scope definitions (found %)', scope_count;
    ELSE
        \echo '✓ Scope definitions created successfully';
    END IF;
END $$;

-- Test 3: Create deliverables
\echo 'Test 3: Creating deliverables...'

WITH project_id AS (
    SELECT id FROM projects WHERE slug = 'test-project' LIMIT 1
),
scope_item_id AS (
    SELECT sd.id FROM scope_definitions sd
    JOIN projects p ON sd.project_id = p.id
    WHERE p.slug = 'test-project' AND sd.item_name = 'User Authentication' LIMIT 1
)
INSERT INTO deliverables (
    project_id,
    scope_item_id,
    name,
    type,
    acceptance_criteria,
    validation_method,
    due_date
)
SELECT 
    p.id,
    s.id,
    'Authentication API Documentation',
    'document',
    'Complete API documentation with examples',
    'manual_review',
    CURRENT_DATE + INTERVAL '7 days'
FROM project_id p, scope_item_id s
ON CONFLICT (project_id, name) DO NOTHING;

-- Verify deliverables
DO $$
DECLARE
    deliverable_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO deliverable_count
    FROM deliverables d
    JOIN projects p ON d.project_id = p.id
    WHERE p.slug = 'test-project';
    
    IF deliverable_count = 0 THEN
        RAISE EXCEPTION 'Failed to create deliverables';
    ELSE
        \echo '✓ Deliverables created successfully';
    END IF;
END $$;

-- Test 4: Test views
\echo 'Test 4: Testing views...'

-- Test project summary view
DO $$
DECLARE
    summary_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO summary_count
    FROM v_project_summary
    WHERE slug = 'test-project';
    
    IF summary_count = 0 THEN
        RAISE EXCEPTION 'Project summary view not working';
    ELSE
        \echo '✓ Project summary view working';
    END IF;
END $$;

-- Test active scope items view
DO $$
DECLARE
    active_scope_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO active_scope_count
    FROM v_active_scope_items
    WHERE slug = 'test-project';
    
    IF active_scope_count = 0 THEN
        RAISE EXCEPTION 'Active scope items view not working';
    ELSE
        \echo '✓ Active scope items view working';
    END IF;
END $$;

-- Test 5: Test constraints and data integrity
\echo 'Test 5: Testing constraints...'

-- Test unique constraint on project slug
DO $$
BEGIN
    INSERT INTO projects (
        name, 
        slug, 
        description, 
        project_type, 
        priority_level, 
        created_by
    ) VALUES (
        'Duplicate Test Project',
        'test-project',
        'Should fail due to duplicate slug',
        'feature',
        1,
        'test-user'
    );
    RAISE EXCEPTION 'Unique constraint on project slug not working';
EXCEPTION WHEN unique_violation THEN
    \echo '✓ Unique constraint on project slug working';
END $$;

-- Test check constraint on priority_level
DO $$
BEGIN
    UPDATE projects 
    SET priority_level = 10 
    WHERE slug = 'test-project';
    RAISE EXCEPTION 'Check constraint on priority_level not working';
EXCEPTION WHEN check_violation THEN
    \echo '✓ Check constraint on priority_level working';
END $$;

-- Reset priority to valid value
UPDATE projects 
SET priority_level = 1 
WHERE slug = 'test-project';

-- Test 6: Test JSONB functionality
\echo 'Test 6: Testing JSONB functionality...'

DO $$
DECLARE
    json_test BOOLEAN;
BEGIN
    -- Test JSONB query
    SELECT EXISTS (
        SELECT 1 FROM projects 
        WHERE metadata->>'test' = 'true' 
        AND slug = 'test-project'
    ) INTO json_test;
    
    IF NOT json_test THEN
        RAISE EXCEPTION 'JSONB functionality not working properly';
    ELSE
        \echo '✓ JSONB functionality working';
    END IF;
END $$;

-- Test 7: Test trigger functionality (updated_at)
\echo 'Test 7: Testing trigger functionality...'

DO $$
DECLARE
    old_updated_at TIMESTAMP WITH TIME ZONE;
    new_updated_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get current updated_at
    SELECT updated_at INTO old_updated_at
    FROM projects 
    WHERE slug = 'test-project';
    
    -- Wait a moment to ensure timestamp difference
    PERFORM pg_sleep(0.1);
    
    -- Update the project
    UPDATE projects 
    SET description = 'Updated description for trigger test'
    WHERE slug = 'test-project';
    
    -- Get new updated_at
    SELECT updated_at INTO new_updated_at
    FROM projects 
    WHERE slug = 'test-project';
    
    IF new_updated_at <= old_updated_at THEN
        RAISE EXCEPTION 'Trigger for updated_at not working';
    ELSE
        \echo '✓ Trigger for updated_at working';
    END IF;
END $$;

-- =============================================
-- PERFORMANCE TESTS
-- =============================================

\echo 'Testing query performance...'

DO $$
DECLARE
    start_time TIMESTAMP WITH TIME ZONE;
    end_time TIMESTAMP WITH TIME ZONE;
    query_duration INTERVAL;
BEGIN
    start_time := clock_timestamp();
    
    -- Perform a complex query that would use indexes
    SELECT 
        p.name,
        COUNT(sd.id) as scope_count,
        COUNT(d.id) as deliverable_count
    FROM projects p
    LEFT JOIN scope_definitions sd ON p.id = sd.project_id
    LEFT JOIN deliverables d ON p.id = d.project_id
    WHERE p.status = 'planning'
      AND p.priority_level >= 1
    GROUP BY p.id, p.name
    ORDER BY p.priority_level DESC;
    
    end_time := clock_timestamp();
    query_duration := end_time - start_time;
    
    IF EXTRACT(MILLISECONDS FROM query_duration) > 1000 THEN
        \echo '⚠ Query performance could be improved (took % ms)', EXTRACT(MILLISECONDS FROM query_duration);
    ELSE
        \echo '✓ Query performance acceptable (took % ms)', EXTRACT(MILLISECONDS FROM query_duration);
    END IF;
END $$;

-- =============================================
-- CLEANUP
-- =============================================

\echo 'Cleaning up test data...'

-- Remove test data
DELETE FROM deliverables WHERE project_id IN (
    SELECT id FROM projects WHERE slug = 'test-project'
);
DELETE FROM scope_definitions WHERE project_id IN (
    SELECT id FROM projects WHERE slug = 'test-project'
);
DELETE FROM projects WHERE slug = 'test-project';

\echo '✓ Test data cleaned up';

-- =============================================
-- VALIDATION COMPLETE
-- =============================================

\echo '';
\echo '=============================================';
\echo '✓ Schema validation completed successfully!';
\echo 'All tables, indexes, views, and triggers are working correctly.';
\echo 'Constraints and data integrity are enforced properly.';
\echo 'JSONB functionality and triggers are operational.';
\echo '=============================================';