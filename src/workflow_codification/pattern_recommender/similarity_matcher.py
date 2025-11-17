"""
Similarity Matcher
Finds existing skills similar to detected workflow patterns using Jaccard similarity
"""
from typing import List, Dict, Set
import os
import glob


class SimilarityMatcher:
    """
    Calculate similarity between workflow patterns and existing skills
    Uses Jaccard similarity: |A ∩ B| / |A ∪ B|
    """

    @staticmethod
    def tokenize_workflow(workflow: List[str]) -> Set[str]:
        """
        Tokenize workflow into set of keywords

        Args:
            workflow: List of commands (or list with description)

        Returns:
            Set of lowercase keywords
        """
        keywords = set()

        for item in workflow:
            # Split into words and add to keywords
            if isinstance(item, str):
                words = item.lower().split()
                keywords.update(words)

        return keywords

    @staticmethod
    def jaccard_similarity(set_a: Set, set_b: Set) -> float:
        """
        Calculate Jaccard similarity between two sets

        Args:
            set_a: First set
            set_b: Second set

        Returns:
            Similarity score (0.0 - 1.0)
        """
        if not set_a and not set_b:
            return 0.0

        intersection = set_a & set_b
        union = set_a | set_b

        return len(intersection) / len(union) if union else 0.0

    @staticmethod
    def load_existing_skills() -> List[Dict]:
        """
        Load existing skills from .claude/skills/ directory

        Returns:
            List of skills with names, descriptions, and keywords
        """
        skills = []
        skills_base_path = "./.claude/skills/"

        # Handle both absolute and relative paths
        if not os.path.exists(skills_base_path):
            skills_base_path = os.path.join(
                os.path.dirname(__file__),
                "../../../.claude/skills/"
            )

        if not os.path.exists(skills_base_path):
            return skills

        skill_dirs = glob.glob(os.path.join(skills_base_path, "*/"))

        for skill_dir in skill_dirs:
            skill_name = os.path.basename(skill_dir.rstrip('/'))

            # Read SKILL.md for description (optional)
            skill_md = os.path.join(skill_dir, "SKILL.md")
            description = ""

            if os.path.exists(skill_md):
                try:
                    with open(skill_md, 'r', encoding='utf-8') as f:
                        description = f.read()[:500]  # First 500 chars
                except Exception:
                    description = skill_name

            skills.append({
                "name": skill_name,
                "description": description,
                "keywords": SimilarityMatcher.tokenize_workflow([description])
            })

        return skills

    @staticmethod
    def find_similar_skills(
        workflow: List[str],
        min_similarity: float = 0.3,
        top_n: int = 5
    ) -> List[Dict]:
        """
        Find existing skills similar to workflow pattern

        Args:
            workflow: Command sequence
            min_similarity: Minimum similarity threshold (default: 0.3)
            top_n: Max results to return (default: 5)

        Returns:
            List of similar skills with similarity scores
        """
        workflow_keywords = SimilarityMatcher.tokenize_workflow(workflow)
        existing_skills = SimilarityMatcher.load_existing_skills()

        similar_skills = []

        for skill in existing_skills:
            similarity = SimilarityMatcher.jaccard_similarity(
                workflow_keywords,
                skill["keywords"]
            )

            if similarity >= min_similarity:
                similar_skills.append({
                    "skill_name": skill["name"],
                    "similarity": round(similarity, 2)
                })

        # Sort by similarity (descending) and take top N
        similar_skills.sort(key=lambda x: x["similarity"], reverse=True)
        return similar_skills[:top_n]
