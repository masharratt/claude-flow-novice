#!/usr/bin/env python3
"""
Python logic for Skills Database YAML import
Called from import-from-yaml.sh with arguments:
  sys.argv[1] = input_file
  sys.argv[2] = db_path
  sys.argv[3] = import_mode
  sys.argv[4] = dry_run ("1" or "0")
  sys.argv[5] = force ("1" or "0")
  sys.argv[6] = skip_conflicts ("1" or "0")
  sys.argv[7] = verbose ("1" or "0")
"""

import sqlite3
import json
import sys

def log(msg):
    print(f"[INFO] {msg}", file=sys.stderr)

def log_verbose(msg, verbose):
    if verbose:
        print(f"[VERBOSE] {msg}", file=sys.stderr)

def main():
    # Parse arguments
    input_file = sys.argv[1]
    db_path = sys.argv[2]
    import_mode = sys.argv[3]
    dry_run = sys.argv[4] == "1"
    force = sys.argv[5] == "1"
    skip_conflicts = sys.argv[6] == "1"
    verbose = sys.argv[7] == "1"

    # Load YAML
    try:
        import yaml
        with open(input_file, 'r') as f:
            data = yaml.safe_load(f)
    except ImportError:
        print("Error: pyyaml required (pip install pyyaml)", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error loading YAML: {e}", file=sys.stderr)
        sys.exit(1)

    # Connect to database
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Statistics
    stats = {
        "skills_inserted": 0,
        "skills_updated": 0,
        "skills_skipped": 0,
        "mappings_inserted": 0,
        "mappings_updated": 0,
        "history_inserted": 0,
        "errors": 0
    }

    try:
        if not dry_run:
            cursor.execute("BEGIN TRANSACTION;")

        # Replace mode - clear existing data
        if import_mode == "replace" and not dry_run:
            cursor.execute("DELETE FROM agent_skill_mappings;")
            cursor.execute("DELETE FROM approval_history;")
            cursor.execute("DELETE FROM skills;")
            log("Cleared existing data (replace mode)")

        # Import skills
        log(f"Importing {len(data.get('skills', []))} skills...")
        for skill in data.get('skills', []):
            try:
                # Check if exists
                cursor.execute("SELECT id, content_hash FROM skills WHERE name = ?;", (skill['name'],))
                existing = cursor.fetchone()

                if existing:
                    # Conflict detection
                    if existing['content_hash'] != skill.get('content_hash', ''):
                        if skip_conflicts:
                            log_verbose(f"Skipping conflict: {skill['name']}", verbose)
                            stats['skills_skipped'] += 1
                            continue
                        elif not force:
                            log_verbose(f"Hash mismatch for {skill['name']}", verbose)
                            stats['skills_skipped'] += 1
                            continue

                    # Update existing
                    if not dry_run:
                        cursor.execute("""
                        UPDATE skills SET
                            category = ?, team = ?, content_path = ?, content_hash = ?,
                            tags = ?, version = ?, status = ?, approval_level = ?,
                            approval_criteria = ?, last_approved_by = ?, last_approval_date = ?,
                            test_coverage = ?, test_suite_path = ?, required_test_pass_rate = ?,
                            phase4_pattern_id = ?, generated_by = ?, is_auto_generated = ?,
                            deprecation_note = ?, replacement_id = ?, owner = ?,
                            updated_at = datetime('now')
                        WHERE id = ?;
                        """, (
                            skill['category'], skill.get('team'), skill['content_path'],
                            skill.get('content_hash', ''), json.dumps(skill.get('tags', [])),
                            skill['version'], skill.get('status', 'active'),
                            skill.get('approval_level', 'human'),
                            json.dumps(skill.get('approval_criteria')) if skill.get('approval_criteria') else None,
                            skill.get('last_approved_by'), skill.get('last_approval_date'),
                            skill.get('test_coverage'), skill.get('test_suite_path'),
                            skill.get('required_test_pass_rate', 0.95),
                            skill.get('phase4_pattern_id'), skill.get('generated_by'),
                            skill.get('is_auto_generated', 0), skill.get('deprecation_note'),
                            skill.get('replacement_id'), skill.get('owner'),
                            existing['id']
                        ))
                    log_verbose(f"Updated: {skill['name']}", verbose)
                    stats['skills_updated'] += 1
                else:
                    # Insert new
                    if not dry_run:
                        cursor.execute("""
                        INSERT INTO skills (
                            name, category, team, content_path, content_hash, tags, version,
                            status, approval_level, approval_criteria, last_approved_by,
                            last_approval_date, test_coverage, test_suite_path,
                            required_test_pass_rate, phase4_pattern_id, generated_by,
                            is_auto_generated, deprecation_note, replacement_id, owner
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                        """, (
                            skill['name'], skill['category'], skill.get('team'),
                            skill['content_path'], skill.get('content_hash', ''),
                            json.dumps(skill.get('tags', [])), skill['version'],
                            skill.get('status', 'active'), skill.get('approval_level', 'human'),
                            json.dumps(skill.get('approval_criteria')) if skill.get('approval_criteria') else None,
                            skill.get('last_approved_by'), skill.get('last_approval_date'),
                            skill.get('test_coverage'), skill.get('test_suite_path'),
                            skill.get('required_test_pass_rate', 0.95),
                            skill.get('phase4_pattern_id'), skill.get('generated_by'),
                            skill.get('is_auto_generated', 0), skill.get('deprecation_note'),
                            skill.get('replacement_id'), skill.get('owner')
                        ))
                    log_verbose(f"Inserted: {skill['name']}", verbose)
                    stats['skills_inserted'] += 1

            except Exception as e:
                print(f"[ERROR] Skill {skill.get('name', '?')}: {e}", file=sys.stderr)
                stats['errors'] += 1

        # Import agent mappings
        if 'agent_skill_mappings' in data:
            log(f"Importing {len(data['agent_skill_mappings'])} mappings...")
            for mapping in data['agent_skill_mappings']:
                try:
                    cursor.execute("""
                    SELECT id FROM agent_skill_mappings
                    WHERE agent_type = ? AND skill_id = ?;
                    """, (mapping['agent_type'], mapping['skill_id']))

                    if cursor.fetchone():
                        if not dry_run:
                            cursor.execute("""
                            UPDATE agent_skill_mappings SET
                                priority = ?, required = ?, conditions = ?,
                                tdd_condition = ?, notes = ?, enabled = ?,
                                updated_at = datetime('now')
                            WHERE agent_type = ? AND skill_id = ?;
                            """, (
                                mapping.get('priority', 5), mapping.get('required', 0),
                                json.dumps(mapping.get('conditions')) if mapping.get('conditions') else None,
                                json.dumps(mapping.get('tdd_condition')) if mapping.get('tdd_condition') else None,
                                mapping.get('notes'), mapping.get('enabled', 1),
                                mapping['agent_type'], mapping['skill_id']
                            ))
                        stats['mappings_updated'] += 1
                    else:
                        if not dry_run:
                            cursor.execute("""
                            INSERT INTO agent_skill_mappings (
                                agent_type, skill_id, priority, required, conditions,
                                tdd_condition, notes, enabled
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                            """, (
                                mapping['agent_type'], mapping['skill_id'],
                                mapping.get('priority', 5), mapping.get('required', 0),
                                json.dumps(mapping.get('conditions')) if mapping.get('conditions') else None,
                                json.dumps(mapping.get('tdd_condition')) if mapping.get('tdd_condition') else None,
                                mapping.get('notes'), mapping.get('enabled', 1)
                            ))
                        stats['mappings_inserted'] += 1

                except Exception as e:
                    print(f"[ERROR] Mapping: {e}", file=sys.stderr)
                    stats['errors'] += 1

        # Import approval history
        if 'approval_history' in data:
            log(f"Importing {len(data['approval_history'])} history records...")
            for history in data['approval_history']:
                try:
                    if not dry_run:
                        cursor.execute("""
                        INSERT INTO approval_history (
                            skill_id, version, approval_level, approver, decision,
                            reasoning, risk_assessment, test_results, approval_criteria_check,
                            escalation_reason, escalated_to, escalation_timestamp,
                            timestamp, review_duration_minutes
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                        """, (
                            history['skill_id'], history['version'], history['approval_level'],
                            history.get('approver'), history['decision'], history.get('reasoning'),
                            json.dumps(history.get('risk_assessment')) if history.get('risk_assessment') else None,
                            json.dumps(history.get('test_results')) if history.get('test_results') else None,
                            json.dumps(history.get('approval_criteria_check')) if history.get('approval_criteria_check') else None,
                            history.get('escalation_reason'), history.get('escalated_to'),
                            history.get('escalation_timestamp'), history.get('timestamp'),
                            history.get('review_duration_minutes')
                        ))
                    stats['history_inserted'] += 1

                except Exception as e:
                    print(f"[ERROR] History: {e}", file=sys.stderr)
                    stats['errors'] += 1

        # Output statistics
        print(f"STATS_SKILLS_INSERTED={stats['skills_inserted']}")
        print(f"STATS_SKILLS_UPDATED={stats['skills_updated']}")
        print(f"STATS_SKILLS_SKIPPED={stats['skills_skipped']}")
        print(f"STATS_MAPPINGS_INSERTED={stats['mappings_inserted']}")
        print(f"STATS_MAPPINGS_UPDATED={stats['mappings_updated']}")
        print(f"STATS_HISTORY_INSERTED={stats['history_inserted']}")
        print(f"STATS_ERRORS={stats['errors']}")

        # Commit or rollback
        if not dry_run:
            conn.commit()
            log("Transaction committed")
        else:
            conn.rollback()
            log("Dry run - rolled back")

        conn.close()
        sys.exit(0 if stats['errors'] == 0 else 1)

    except Exception as e:
        if not dry_run:
            conn.rollback()
        print(f"[ERROR] Import failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        conn.close()
        sys.exit(1)

if __name__ == "__main__":
    main()
