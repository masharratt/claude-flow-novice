/**
 * Phase Parser
 *
 * Parses phase markdown files to extract sprint information
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PhaseParserResult, Sprint } from './epic-parser-types.js';
import { MarkdownSanitizer } from '../utils/markdown-sanitizer.js';

export class PhaseParser {
  /**
   * Parse a phase markdown file
   */
  static parsePhaseFile(filePath: string): PhaseParserResult {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Phase file not found: ${filePath}`);
    }

    // Read and sanitize markdown content (CVE-2025-006 mitigation)
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const content = MarkdownSanitizer.sanitize(rawContent);
    const lines = content.split('\n');

    // Extract phase metadata
    const rawPhaseId = this.extractFieldValue(lines, 'Phase ID') || path.basename(filePath, '.md');
    const phaseId = MarkdownSanitizer.sanitizeId(rawPhaseId, 'phase');
    const name = this.extractHeading(lines, 1) || 'Unknown Phase';
    const status = this.extractStatus(lines);
    const dependencies = this.extractDependencies(lines);
    const estimatedDuration = this.extractFieldValue(lines, 'Estimated Duration') || 'Unknown';

    // Extract description (text between first heading and "Sprint Breakdown")
    const description = this.extractDescription(lines);

    // Extract sprints
    const sprints = this.extractSprints(content, phaseId);

    return {
      phaseId,
      name,
      description,
      status,
      dependencies,
      estimatedDuration,
      sprints,
    };
  }

  /**
   * Extract field value from markdown metadata
   */
  private static extractFieldValue(lines: string[], fieldName: string): string | null {
    const pattern = new RegExp(`\\*\\*${fieldName}\\*\\*:\\s*\`?([^\`\n]+)\`?`, 'i');
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  /**
   * Extract heading by level
   */
  private static extractHeading(lines: string[], level: number): string | null {
    const headingPrefix = '#'.repeat(level);
    for (const line of lines) {
      if (line.startsWith(`${headingPrefix} `) && !line.startsWith(`${headingPrefix}#`)) {
        return line.replace(headingPrefix, '').trim();
      }
    }
    return null;
  }

  /**
   * Extract status from markdown
   */
  private static extractStatus(lines: string[]): 'not_started' | 'in_progress' | 'completed' {
    const statusLine = lines.find(line => line.includes('**Status**'));
    if (!statusLine) return 'not_started';

    if (statusLine.includes('✅') || statusLine.toLowerCase().includes('completed')) {
      return 'completed';
    } else if (statusLine.includes('🔄') || statusLine.toLowerCase().includes('in progress')) {
      return 'in_progress';
    } else {
      return 'not_started';
    }
  }

  /**
   * Extract dependencies from markdown
   */
  private static extractDependencies(lines: string[]): string[] {
    const dependenciesValue = this.extractFieldValue(lines, 'Dependencies');
    if (!dependenciesValue || dependenciesValue.toLowerCase() === 'none') {
      return [];
    }

    // Parse comma-separated dependencies
    return dependenciesValue
      .split(',')
      .map(dep => dep.trim())
      .filter(dep => dep.length > 0);
  }

  /**
   * Extract description
   */
  private static extractDescription(lines: string[]): string {
    let inDescription = false;
    const descriptionLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('## Phase Description') || line.startsWith('## Epic Description')) {
        inDescription = true;
        continue;
      }

      if (inDescription) {
        if (line.startsWith('##')) {
          break;
        }
        if (line.trim()) {
          descriptionLines.push(line.trim());
        }
      }
    }

    return descriptionLines.join(' ').trim() || 'No description provided';
  }

  /**
   * Extract all sprints from phase content
   */
  private static extractSprints(content: string, phaseId: string): Sprint[] {
    const sprints: Sprint[] = [];

    // Match sprint sections (### Sprint X.Y: Title)
    const sprintRegex = /### Sprint (\d+\.\d+):\s*(.+?)(?=###|$)/gs;
    let match;

    while ((match = sprintRegex.exec(content)) !== null) {
      const sprintNumber = match[1];
      const rawSprintTitle = match[2].split('\n')[0].trim();
      const sprintTitle = MarkdownSanitizer.sanitize(rawSprintTitle, { maxLength: 200 });
      const sprintContent = match[0];

      const sprint = this.parseSprint(sprintNumber, sprintTitle, sprintContent, phaseId);
      sprints.push(sprint);
    }

    return sprints;
  }

  /**
   * Parse individual sprint section
   */
  private static parseSprint(
    sprintNumber: string,
    sprintTitle: string,
    content: string,
    phaseId: string
  ): Sprint {
    const lines = content.split('\n');

    // Sanitize sprint ID (CVE-2025-005)
    const rawSprintId = `sprint-${sprintNumber}`;
    const sprintId = MarkdownSanitizer.sanitizeId(rawSprintId, 'sprint');

    const status = this.extractSprintStatus(lines);
    const duration = this.extractSprintDuration(lines);
    const dependencies = this.extractSprintDependencies(lines, phaseId);
    const crossPhaseDependencies = this.extractCrossPhaseDependencies(lines);
    const acceptanceCriteria = this.extractAcceptanceCriteria(lines);
    const tasks = this.extractTasks(lines);
    const deliverables = this.extractDeliverables(lines);

    // Sanitize sprint description in acceptance criteria (CVE-2025-006)
    const sanitizedCriteria = acceptanceCriteria.map(criteria =>
      MarkdownSanitizer.sanitizeSprintDescription(criteria)
    );

    return {
      sprintId,
      name: sprintTitle,
      status,
      duration,
      dependencies,
      ...(crossPhaseDependencies.length > 0 && { crossPhaseDependencies }),
      acceptanceCriteria: sanitizedCriteria,
      ...(tasks.length > 0 && { tasks }),
      ...(deliverables.length > 0 && { deliverables }),
    };
  }

  /**
   * Extract sprint status
   */
  private static extractSprintStatus(lines: string[]): 'not_started' | 'in_progress' | 'completed' {
    const statusLine = lines.find(line => line.includes('**Status**'));
    if (!statusLine) return 'not_started';

    if (statusLine.includes('✅') || statusLine.toLowerCase().includes('completed')) {
      return 'completed';
    } else if (statusLine.includes('🔄') || statusLine.toLowerCase().includes('in progress')) {
      return 'in_progress';
    } else {
      return 'not_started';
    }
  }

  /**
   * Extract sprint duration
   */
  private static extractSprintDuration(lines: string[]): string {
    const durationLine = lines.find(line => line.includes('**Duration**'));
    if (!durationLine) return 'Unknown';

    const match = durationLine.match(/\*\*Duration\*\*:\s*(.+)/);
    return match ? match[1].trim() : 'Unknown';
  }

  /**
   * Extract sprint dependencies
   */
  private static extractSprintDependencies(lines: string[], phaseId: string): string[] {
    const dependenciesLine = lines.find(line => line.includes('**Dependencies**'));
    if (!dependenciesLine) return [];

    const match = dependenciesLine.match(/\*\*Dependencies\*\*:\s*(.+)/);
    if (!match) return [];

    const depsText = match[1].trim();
    if (depsText.toLowerCase() === 'none') return [];

    // Parse dependencies: "Sprint 1.1, Sprint 1.2" or "phase-1/sprint-1.1"
    return depsText
      .split(',')
      .map(dep => {
        const trimmed = dep.trim();
        // Convert "Sprint X.Y" to "sprint-X.Y" format
        if (trimmed.match(/^Sprint \d+\.\d+$/i)) {
          return `sprint-${trimmed.replace(/Sprint /i, '')}`;
        }
        return trimmed;
      })
      .filter(dep => dep.length > 0);
  }

  /**
   * Extract cross-phase dependencies
   */
  private static extractCrossPhaseDependencies(lines: string[]): string[] {
    const crossPhaseLine = lines.find(line => line.includes('crossPhaseDependencies') || line.includes('Cross-Phase Dependencies'));
    if (!crossPhaseLine) return [];

    const match = crossPhaseLine.match(/\[([^\]]+)\]/);
    if (!match) return [];

    return match[1]
      .split(',')
      .map(dep => dep.trim().replace(/['"]/g, ''))
      .filter(dep => dep.length > 0);
  }

  /**
   * Extract acceptance criteria
   */
  private static extractAcceptanceCriteria(lines: string[]): string[] {
    const criteria: string[] = [];
    let inCriteria = false;

    for (const line of lines) {
      if (line.includes('**Acceptance Criteria**')) {
        inCriteria = true;
        continue;
      }

      if (inCriteria) {
        if (line.startsWith('**') || line.startsWith('###')) {
          break;
        }

        // Match bullet points with criteria
        const bulletMatch = line.match(/^[-*]\s+(.+)/);
        if (bulletMatch) {
          criteria.push(bulletMatch[1].trim());
        }
      }
    }

    return criteria;
  }

  /**
   * Extract tasks from sprint section
   */
  private static extractTasks(lines: string[]): string[] {
    const tasks: string[] = [];
    let inTasks = false;

    for (const line of lines) {
      if (line.includes('**Tasks**')) {
        inTasks = true;
        continue;
      }

      if (inTasks) {
        if (line.startsWith('**') || line.startsWith('###')) {
          break;
        }

        // Match numbered tasks
        const taskMatch = line.match(/^\d+\.\s+(.+)/);
        if (taskMatch) {
          tasks.push(taskMatch[1].trim());
        }
      }
    }

    return tasks;
  }

  /**
   * Extract deliverables from sprint section
   */
  private static extractDeliverables(lines: string[]): string[] {
    const deliverables: string[] = [];
    let inDeliverables = false;

    for (const line of lines) {
      if (line.includes('**Deliverables**')) {
        inDeliverables = true;
        continue;
      }

      if (inDeliverables) {
        if (line.startsWith('**') || line.startsWith('###')) {
          break;
        }

        // Match bullet points or backtick-wrapped file paths
        const bulletMatch = line.match(/^[-*]\s+`?([^`\n]+)`?/);
        if (bulletMatch) {
          deliverables.push(bulletMatch[1].trim());
        }
      }
    }

    return deliverables;
  }
}
