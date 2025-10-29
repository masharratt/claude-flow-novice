#!/usr/bin/env python3

import os
import re
import sys
import json
import logging
from datetime import datetime

import yaml  # Make sure to `pip install PyYAML`

AGENTS_DIR = "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/agents"
OUTPUT_FILE = "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/agent-discovery/agents-registry.json"

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Mapping agent types to loops
LOOP_MAPPING = {
    "backend-dev": "loop3",
    "frontend-dev": "loop3",
    "coder": "loop3",
    "developer": "loop3",
    "api-designer": "loop3",
    "devops-engineer": "loop3",
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

def extract_frontmatter(file_path):
    """
    Extract and parse frontmatter from markdown file using PyYAML.
    Handles multiline descriptions and Windows line endings.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = clean_windows_endings(f.read())
            match = re.search(r'^---\n(.*?)\n---', content, re.DOTALL | re.MULTILINE)

            if not match:
                logger.warning(f"No frontmatter found in {file_path}")
                return None

            frontmatter_str = match.group(1)

            # Use PyYAML for robust parsing
            try:
                frontmatter = yaml.safe_load(frontmatter_str)
                return frontmatter
            except yaml.YAMLError as e:
                logger.error(f"YAML parsing error in {file_path}: {e}")
                return None

    except Exception as e:
        logger.error(f"Error reading {file_path}: {e}")
        return None

def determine_loop(agent_type):
    """Determine the loop for an agent type."""
    agent_type = str(agent_type).lower()
    return LOOP_MAPPING.get(agent_type, "strategic")

def relative_path_from_agents(file_path):
    """
    Convert absolute file path to relative path from .claude/agents/
    Maintain flat namespace
    """
    base_len = len(AGENTS_DIR)
    relative_path = file_path[base_len+1:]
    return relative_path

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
            name = str(frontmatter.get('name', filename.replace('.md', '')))
            description = str(frontmatter.get('description', ''))
            agent_type = str(frontmatter.get('type', 'specialist'))
            keywords = frontmatter.get('keywords', [])

            # Handle potential list conversion
            if not isinstance(keywords, list):
                keywords = [keywords] if keywords else []

            # Determine loop
            loop = determine_loop(agent_type)

            # Create agent entry
            agent_entry = {
                "name": name,
                "description": description,
                "type": agent_type,
                "loop": loop,
                "keywords": keywords,
                "file": relative_path_from_agents(file_path)  # Relative path from .claude/agents/
            }

            logger.info(f"Processing agent: {name}")
            logger.debug(f"Agent details: {json.dumps(agent_entry, indent=2)}")

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
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(registry, f, indent=2)

        logger.info(f"Agent registry generated: {OUTPUT_FILE}")
        logger.info(f"Total agents discovered: {len(agents)}")

        if skipped_files:
            logger.warning(f"Skipped files: {', '.join(skipped_files)}")

        # Verify file was written
        if os.path.getsize(OUTPUT_FILE) > 0:
            logger.info("File successfully generated and not empty.")
        else:
            raise ValueError("Output file is empty.")

    except Exception as e:
        logger.error(f"Error writing registry: {e}")
        sys.exit(1)

def main():
    try:
        process_agents()
    except Exception as e:
        logger.critical(f"Unhandled exception: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()