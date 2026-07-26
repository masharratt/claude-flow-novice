/**
 * Regression test for self-dependency bug in package.json.
 *
 * Bug: package.json listed its own name ("claude-flow-novice") inside the
 * "dependencies" block (previously line 99: "claude-flow-novice": "^2.18.6").
 * This broke `npm install` on every fresh clone: npm resolved the self-dep to
 * the published registry version, which declared an unsatisfiable peer on the
 * npm package "docker", producing ETARGET and aborting the install. No source
 * code imports the package by name, so the self-dep serves no purpose.
 *
 * This test ensures the package never lists itself in any dependency block.
 */

import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

describe('package.json manifest', () => {
  // This test lives at tests/unit/package-manifest.test.ts, so __dirname is
  // tests/unit/, two levels under the repo root.
  const manifestPath = path.resolve(__dirname, '../../package.json');
  const pkg: PackageJson = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  test('regression: package must not list itself as a dependency (self-dep broke npm install for fresh clones)', () => {
    const selfName = pkg.name;
    expect(selfName).toBeTruthy();

    const depBlocks: ReadonlyArray<readonly [string, Record<string, string> | undefined]> = [
      ['dependencies', pkg.dependencies],
      ['devDependencies', pkg.devDependencies],
      ['peerDependencies', pkg.peerDependencies],
      ['optionalDependencies', pkg.optionalDependencies],
    ];

    const offenders: string[] = [];
    for (const [blockName, block] of depBlocks) {
      if (block && Object.prototype.hasOwnProperty.call(block, selfName as string)) {
        offenders.push(`${blockName}="${block[selfName as string]}"`);
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `package.json must not depend on itself ("${selfName}"), but the package name appears in these blocks: ${offenders.join(', ')}.`
      );
    }

    expect(offenders).toEqual([]);
  });
});
