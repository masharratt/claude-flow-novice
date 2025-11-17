/**
 * Test Suite for Issue #12: ANSI Color Code Handling in Table Formatting
 *
 * Tests the stripAnsi() function and formatTable() to verify ANSI escape codes
 * don't affect column width calculations or table alignment.
 */

import { describe, it, expect } from '@jest/globals';

// Copy the functions from skill-cli.ts for testing
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return 'No results found.';
  }

  // Calculate column widths - strip ANSI codes before measuring
  const colWidths = headers.map((header, i) => {
    const maxDataWidth = Math.max(...rows.map(row => stripAnsi((row[i] || '').toString()).length));
    return Math.max(stripAnsi(header).length, maxDataWidth);
  });

  // Build separator
  const separator = colWidths.map(w => '-'.repeat(w)).join('-+-');

  // Build header - use stripped length for padding calculation
  const headerRow = headers.map((h, i) => {
    const stripped = stripAnsi(h);
    const padding = colWidths[i] - stripped.length;
    return h + ' '.repeat(Math.max(0, padding));
  }).join(' | ');

  // Build data rows - use stripped length for padding calculation
  const dataRows = rows.map(row =>
    row.map((cell, i) => {
      const cellStr = (cell || '').toString();
      const stripped = stripAnsi(cellStr);
      const padding = colWidths[i] - stripped.length;
      return cellStr + ' '.repeat(Math.max(0, padding));
    }).join(' | ')
  );

  return [headerRow, separator, ...dataRows].join('\n');
}

describe('Issue #12: ANSI Color Code Handling', () => {
  describe('stripAnsi()', () => {
    it('should remove basic ANSI color codes', () => {
      const input = '\x1b[31mRed Text\x1b[0m';
      const result = stripAnsi(input);
      expect(result).toBe('Red Text');
    });

    it('should remove multiple ANSI codes', () => {
      const input = '\x1b[1m\x1b[32mBold Green\x1b[0m\x1b[0m';
      const result = stripAnsi(input);
      expect(result).toBe('Bold Green');
    });

    it('should handle strings without ANSI codes', () => {
      const input = 'Plain Text';
      const result = stripAnsi(input);
      expect(result).toBe('Plain Text');
    });

    it('should remove complex ANSI codes with parameters', () => {
      const input = '\x1b[38;5;123mColor 123\x1b[0m';
      const result = stripAnsi(input);
      expect(result).toBe('Color 123');
    });
  });

  describe('formatTable() with ANSI codes', () => {
    it('should align columns correctly when headers contain ANSI codes', () => {
      const headers = ['\x1b[32mName\x1b[0m', '\x1b[34mStatus\x1b[0m'];
      const rows = [
        ['Alice', 'Active'],
        ['Bob', 'Inactive']
      ];

      const result = formatTable(headers, rows);
      const lines = result.split('\n');

      // Verify header alignment (visual length should match despite ANSI codes)
      expect(lines[0]).toContain('Name');
      expect(lines[0]).toContain('Status');

      // Verify separator matches column widths (headers with ANSI codes removed)
      expect(lines[1]).toBe('------+---------');

      // Verify data rows align properly
      expect(lines[2]).toBe('Alice | Active  ');
      expect(lines[3]).toBe('Bob   | Inactive');
    });

    it('should align columns correctly when data cells contain ANSI codes', () => {
      const headers = ['Name', 'Status'];
      const rows = [
        ['\x1b[31mError\x1b[0m', '\x1b[32mOK\x1b[0m'],
        ['Warning', 'Pending']
      ];

      const result = formatTable(headers, rows);
      const lines = result.split('\n');

      // Verify separator (should be based on actual text length, not with ANSI codes)
      expect(lines[1]).toBe('--------+--------');

      // Verify data rows maintain alignment
      const row1VisualLength = stripAnsi(lines[2]).length;
      const row2VisualLength = stripAnsi(lines[3]).length;
      expect(row1VisualLength).toBe(row2VisualLength);
    });

    it('should handle mixed ANSI codes in headers and data', () => {
      const headers = ['\x1b[1mID\x1b[0m', '\x1b[4mName\x1b[0m', 'Value'];
      const rows = [
        ['1', '\x1b[32mSuccess\x1b[0m', '100'],
        ['2', '\x1b[31mFailed\x1b[0m', '0']
      ];

      const result = formatTable(headers, rows);
      const lines = result.split('\n');

      // Verify all rows have same visual length
      const visualLengths = lines.map(line => stripAnsi(line).length);
      expect(visualLengths[0]).toBe(visualLengths[2]); // header vs data row
      expect(visualLengths[2]).toBe(visualLengths[3]); // data row 1 vs 2
    });

    it('should return "No results found." for empty rows', () => {
      const result = formatTable(['Col1', 'Col2'], []);
      expect(result).toBe('No results found.');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      expect(stripAnsi('')).toBe('');
    });

    it('should handle null/undefined cells', () => {
      const headers = ['Name', 'Value'];
      const rows = [
        ['Test', null as any],
        ['Test2', undefined as any]
      ];

      const result = formatTable(headers, rows);
      expect(result).toContain('Test');
    });

    it('should handle very long ANSI sequences', () => {
      const longAnsi = '\x1b[1m\x1b[31m\x1b[4m\x1b[38;5;200mText\x1b[0m\x1b[0m\x1b[0m\x1b[0m';
      const result = stripAnsi(longAnsi);
      expect(result).toBe('Text');
    });
  });
});
