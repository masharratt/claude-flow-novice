/**
 * Simple test to verify Phase 2 implementation
 *
 * Run: npx ts-node .claude/skills/cfn-seo/phases/test-phase-2.ts
 */

import { executePhase1 } from './phase-1-technical.js';
import { executePhase2, ContentInventoryOutput } from './phase-2-content.js';

async function testPhase2() {
  console.log('=== Phase 2 Content Inventory Test ===\n');

  const domain = 'example.com';

  // Step 1: Execute Phase 1 (prerequisite)
  console.log('Step 1: Executing Phase 1...');
  const phase1Output = await executePhase1({ domain, skipCache: true });
  console.log(`Phase 1 complete: health score ${phase1Output.technical_health_score.toFixed(2)}\n`);

  // Step 2: Execute Phase 2
  console.log('Step 2: Executing Phase 2...');
  const phase2Output: ContentInventoryOutput = await executePhase2({
    domain,
    phase1Output,
    skipCache: true
  });

  console.log('\n=== Phase 2 Results ===');
  console.log(`Domain: ${phase2Output.domain}`);
  console.log(`Total Pages: ${phase2Output.total_content_pages}`);
  console.log(`Quality Score: ${phase2Output.content_quality_score.toFixed(2)}`);
  console.log(`\nContent by Type:`);
  console.log(`  - Blog Posts: ${phase2Output.content_by_type.blog_posts}`);
  console.log(`  - Product Pages: ${phase2Output.content_by_type.product_pages}`);
  console.log(`  - Category Pages: ${phase2Output.content_by_type.category_pages}`);
  console.log(`  - Landing Pages: ${phase2Output.content_by_type.landing_pages}`);
  console.log(`  - Other: ${phase2Output.content_by_type.other}`);
  console.log(`\nContent Clusters: ${phase2Output.content_clusters.length}`);
  phase2Output.content_clusters.forEach(cluster => {
    console.log(`  - ${cluster.theme}: ${cluster.page_count} pages, ${cluster.avg_word_count} avg words`);
  });
  console.log(`\nInternal Linking:`);
  console.log(`  - Avg Links/Page: ${phase2Output.internal_linking.avg_internal_links_per_page.toFixed(1)}`);
  console.log(`  - Orphan Pages: ${phase2Output.internal_linking.orphan_pages}`);
  console.log(`  - Hub Pages: ${phase2Output.internal_linking.hub_pages.join(', ')}`);
  console.log(`\nTimestamp: ${phase2Output.timestamp}`);
  console.log(`Cached: ${phase2Output.cached}`);

  // Step 3: Test blocking condition (low health score)
  console.log('\n=== Testing Blocking Condition ===');
  const lowHealthPhase1 = {
    ...phase1Output,
    technical_health_score: 0.45
  };

  try {
    await executePhase2({
      domain,
      phase1Output: lowHealthPhase1,
      skipCache: true
    });
    console.log('ERROR: Should have thrown error for low health score');
  } catch (error) {
    console.log(`✓ Blocking condition validated: ${(error as Error).message}`);
  }

  console.log('\n=== Test Complete ===');
}

// Run test
testPhase2().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
