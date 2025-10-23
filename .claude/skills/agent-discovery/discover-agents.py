#!/usr/bin/env python3

import os
import re
import sys
import json
from datetime import datetime

AGENTS_DIR = "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/agents"
OUTPUT_FILE = "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/agent-discovery/agents-registry.json"

# Mapping agent types to loops
LOOP_MAPPING = {
    "backend-dev": "loop3",
    "frontend-dev": "loop3",
    "coder": "loop3",
    "developer": "loop3",
    "api-designer": "loop3",
    "devops": "loop3",
    "security-specialist": "loop3",
    "researcher": "loop3",
    "reviewer": "loop2",
    "tester": "loop2",
    "validator": "loop2",
    "auditor": "loop2",
    "coordinator": "coordinator",
    "strategic": "strategic"
}

def clean_windows_endings(content):
    """Remove Windows line endings."""
    return content.replace('\r', '')

def parse_yaml_like(yaml_str):
    """
    Simple YAML-like parsing for our specific use case.
    Does not support full YAML spec, just our simple frontmatter.
    """
    result = {}
    for line in yaml_str.split('\n'):
        line = line.strip()
        if not line:
            continue

        # Key-value parsing
        parts = line.split(':', 1)
        if len(parts) == 2:
            key, value = parts[0].strip(), parts[1].strip()

            # Handle list-like values
            if value.startswith('[') and value.endswith(']'):
                value = [v.strip().strip("'\"") for v in value[1:-1].split(',')]
            else:
                value = value.strip("'\"")

            result[key] = value

    return result

def extract_frontmatter(file_path):
    """
    Extract and parse frontmatter from markdown file.
    Handles multiline descriptions and Windows line endings.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = clean_windows_endings(f.read())
            match = re.search(r'^---\n(.*?)\n---', content, re.DOTALL | re.MULTILINE)

            if not match:
                return None

            frontmatter_str = match.group(1)

            # Use our custom parsing
            try:
                frontmatter = parse_yaml_like(frontmatter_str)
                return frontmatter
            except Exception as e:
                print(f"Error parsing frontmatter in {file_path}: {e}")
                return None

    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return None

def determine_loop(agent_type):
    """Determine the loop for an agent type."""
    agent_type = agent_type.lower()
    return LOOP_MAPPING.get(agent_type, "strategic")

def process_agents():
    """Process all agent files and generate registry."""
    agents = []
    skipped_files = []

    # Use os.walk to recursively search for .md files
    for root, dirs, files in os.walk(AGENTS_DIR):
        # Skip hidden directories
        dirs[:] = [d for d in dirs if not d.startswith('.')]

        for filename in files:
            if not filename.endswith('.md'):
                continue

            # Skip documentation files
            if filename in ['AGENT_LIFECYCLE.md', 'CLAUDE.md', 'README.md', 'README-VALIDATION.md', 'index.md']:
                continue

            file_path = os.path.join(root, filename)

            # Skip git files
            if '/.git/' in file_path:
                continue

            frontmatter = extract_frontmatter(file_path)

            if not frontmatter:
                skipped_files.append(file_path)
                continue

            # Extract required fields with fallbacks
            name = frontmatter.get('name', filename.replace('.md', ''))
            description = frontmatter.get('description', '')
            agent_type = frontmatter.get('type', 'specialist')
            keywords = frontmatter.get('keywords', [])

            # Determine loop
            loop = determine_loop(agent_type)

            # Create agent entry
            agent_entry = {
                "name": name,
                "description": description,
                "type": agent_type,
                "loop": loop,
                "keywords": keywords,
                "file": file_path  # Include file path for tracking
            }

            print(f"DEBUG: Processing agent: {name}")
            print(f"DEBUG: Agent details:")
            print(f"  Description: {description}")
            print(f"  Type: {agent_type}")
            print(f"  Loop: {loop}")
            print(f"  Keywords: {keywords}")
            print(f"  File: {file_path}")

            agents.append(agent_entry)

    # Prepare registry
    registry = {
        "agents": agents,
        "last_updated": datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        "total_agents": len(agents)
    }

    # Ensure output directory exists
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    # Write to file
    try:
        print(f"DEBUG: Output path is {OUTPUT_FILE}")
        print(f"DEBUG: Total agents before write: {len(agents)}")

        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(registry, f, indent=2)

        print(f"Agent registry generated: {OUTPUT_FILE}")
        print(f"Total agents discovered: {len(agents)}")

        if skipped_files:
            print("Skipped files:", ", ".join(skipped_files))

        # Verify file was written
        if os.path.getsize(OUTPUT_FILE) > 0:
            print("File successfully generated and not empty.")
        else:
            raise ValueError("Output file is empty.")

    except Exception as e:
        print(f"Error writing registry: {e}")
        sys.exit(1)

if __name__ == "__main__":
    process_agents()