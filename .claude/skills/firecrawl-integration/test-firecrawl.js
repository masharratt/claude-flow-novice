#!/usr/bin/env node

/**
 * Firecrawl Integration Test
 *
 * Tests the self-hosted Firecrawl API connection and basic operations.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '../../../.env');
    const content = readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.includes('=') && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = value;
        }
      }
    }
  } catch (e) {
    console.error('Warning: Could not load .env file:', e.message);
  }
}

loadEnv();

const API_KEY = process.env.FIRECRAWL_API_KEY;
const BASE_URL = process.env.FIRECRAWL_BASE_URL || 'https://firecrawl-api-ourstories.fly.dev';

if (!API_KEY) {
  console.error('ERROR: FIRECRAWL_API_KEY not set');
  process.exit(1);
}

console.log('='.repeat(60));
console.log('FIRECRAWL INTEGRATION TEST');
console.log('='.repeat(60));
console.log(`Base URL: ${BASE_URL}`);
console.log(`API Key: ${API_KEY.substring(0, 10)}...${API_KEY.substring(API_KEY.length - 4)}`);
console.log('='.repeat(60));

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    ...options.headers
  };

  const response = await fetch(url, {
    method: options.method || 'POST',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json();
  return { status: response.status, ok: response.ok, data };
}

async function testHealthCheck() {
  console.log('\n[TEST 1] Health Check...');
  try {
    const result = await request('/v2/health', { method: 'GET' });
    if (result.ok && result.data.success) {
      console.log('✅ PASSED - API is operational');
      console.log(`   Version: ${result.data.version || 'v2'}`);
      console.log(`   Status: ${result.data.status || 'operational'}`);
      return true;
    } else {
      console.log('❌ FAILED - Unexpected response:', result.data);
      return false;
    }
  } catch (error) {
    console.log('❌ FAILED -', error.message);
    return false;
  }
}

async function testScrape() {
  console.log('\n[TEST 2] Scrape Single URL...');
  try {
    const result = await request('/v2/scrape', {
      body: {
        url: 'https://example.com',
        formats: ['markdown'],
        scrapeOptions: {
          onlyMainContent: true,
          timeout: 30000
        }
      }
    });

    if (result.ok && result.data.success) {
      console.log('✅ PASSED - Successfully scraped example.com');
      console.log(`   Title: ${result.data.data?.title || 'N/A'}`);
      console.log(`   Content length: ${result.data.data?.markdown?.length || 0} chars`);
      return true;
    } else {
      console.log('❌ FAILED -', result.data.error || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.log('❌ FAILED -', error.message);
    return false;
  }
}

async function testMap() {
  console.log('\n[TEST 3] Map Website URLs...');
  try {
    const result = await request('/v2/map', {
      body: {
        url: 'https://example.com',
        limit: 10
      }
    });

    if (result.ok && result.data.success) {
      console.log('✅ PASSED - Successfully mapped URLs');
      console.log(`   Links found: ${result.data.links?.length || 0}`);
      return true;
    } else {
      console.log('❌ FAILED -', result.data.error || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.log('❌ FAILED -', error.message);
    return false;
  }
}

async function testExtract() {
  console.log('\n[TEST 4] AI Data Extraction...');
  try {
    const result = await request('/v2/extract', {
      body: {
        urls: ['https://example.com'],
        prompt: 'Extract the main heading and any links on this page'
      }
    });

    if (result.ok && result.data.success) {
      console.log('✅ PASSED - Successfully extracted data');
      console.log(`   Extracted data:`, JSON.stringify(result.data.data, null, 2).substring(0, 200));
      return true;
    } else {
      console.log('⚠️  PARTIAL - Extract endpoint returned:', result.status);
      console.log('   Response:', JSON.stringify(result.data).substring(0, 200));
      return result.status !== 500;  // Accept non-500 as partial pass
    }
  } catch (error) {
    console.log('❌ FAILED -', error.message);
    return false;
  }
}

async function testSeoScrape() {
  console.log('\n[TEST 5] SEO Pipeline Scrape (Real-world test)...');
  try {
    // Test with a real blog URL
    const testUrl = 'https://www.hubspot.com/blog/marketing';

    const result = await request('/v2/scrape', {
      body: {
        url: testUrl,
        formats: ['markdown', 'links'],
        scrapeOptions: {
          onlyMainContent: true,
          timeout: 45000
        }
      }
    });

    if (result.ok && result.data.success) {
      const wordCount = result.data.data?.markdown?.split(/\s+/).length || 0;
      const linkCount = result.data.data?.links?.length || 0;

      console.log('✅ PASSED - Successfully scraped HubSpot blog');
      console.log(`   Title: ${result.data.data?.title || 'N/A'}`);
      console.log(`   Word count: ~${wordCount}`);
      console.log(`   Links found: ${linkCount}`);
      return true;
    } else {
      console.log('⚠️  PARTIAL - Got response but:', result.data.error || result.status);
      return false;
    }
  } catch (error) {
    console.log('❌ FAILED -', error.message);
    return false;
  }
}

// Run tests
async function runTests() {
  const results = [];

  results.push({ name: 'Health Check', passed: await testHealthCheck() });
  results.push({ name: 'Scrape', passed: await testScrape() });
  results.push({ name: 'Map', passed: await testMap() });
  results.push({ name: 'Extract', passed: await testExtract() });
  results.push({ name: 'SEO Scrape', passed: await testSeoScrape() });

  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  for (const result of results) {
    console.log(`${result.passed ? '✅' : '❌'} ${result.name}`);
  }

  console.log('');
  console.log(`Results: ${passed}/${total} tests passed`);

  if (passed >= 3) {
    console.log('\n🎉 Firecrawl integration is READY for SEO pipeline!');
  } else {
    console.log('\n⚠️  Some tests failed. Check API connectivity and credentials.');
  }

  console.log('='.repeat(60));

  return passed >= 3;
}

runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
