#!/usr/bin/env node

/**
 * Direct Z.ai API Test
 * Tests Z.ai API connectivity and response
 */

const https = require('https');
const http = require('http');

const API_KEY = process.env.Z_AI_API_KEY || process.env.ZAI_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
const BASE_URL = 'https://api.z.ai/api/anthropic';
const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'https:' ? https : http;

    const req = protocol.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: JSON.parse(body)
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: body
            });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout after 30s'));
    });

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

async function testZaiAPI() {
  console.log('\n🧪 Z.ai API Direct Test\n');
  console.log('='.repeat(80) + '\n');

  // Check API key
  if (!API_KEY) {
    console.error('❌ ERROR: Z_AI_API_KEY or ZAI_API_KEY environment variable not set');
    console.log('\nPlease set your Z.ai API key:');
    console.log('  export ZAI_API_KEY=$YOUR_KEY');
    console.log('  or');
    console.log('  ZAI_API_KEY=$YOUR_KEY node scripts/test-zai-api.cjs\n');
    process.exit(1);
  }

  console.log('✓ API Key found:', API_KEY.substring(0, 10) + '...' + API_KEY.substring(API_KEY.length - 4));
  console.log('✓ Base URL:', BASE_URL);
  console.log('✓ Model:', DEFAULT_MODEL);
  console.log('\n' + '-'.repeat(80) + '\n');

  // Test payload (Anthropic Messages API format)
  const payload = {
    model: DEFAULT_MODEL,
    max_tokens: 50,
    messages: [
      {
        role: 'user',
        content: 'Say "Hello from Z.ai!" and nothing else.'
      }
    ]
  };

  console.log('📤 Sending request...\n');
  console.log('Request payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\n' + '-'.repeat(80) + '\n');

  try {
    const url = new URL(`${BASE_URL}/v1/messages`);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      protocol: url.protocol,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      }
    };

    const startTime = Date.now();
    const response = await makeRequest(options, JSON.stringify(payload));
    const duration = Date.now() - startTime;

    console.log('📥 Response received!\n');
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📊 Status: ${response.statusCode}`);
    console.log('\n' + '-'.repeat(80) + '\n');

    if (response.body.content && response.body.content.length > 0) {
      console.log('✅ SUCCESS!\n');
      console.log('Response content:');
      console.log('  ' + response.body.content[0].text);
      console.log('\nModel:', response.body.model);
      console.log('Stop reason:', response.body.stop_reason);

      if (response.body.usage) {
        console.log('\nToken usage:');
        console.log('  Input tokens:  ', response.body.usage.input_tokens);
        console.log('  Output tokens: ', response.body.usage.output_tokens);

        // Calculate cost (Z.ai pricing: $0.003 per 1K prompt, $0.015 per 1K completion)
        const promptCost = (response.body.usage.input_tokens / 1000) * 0.003;
        const completionCost = (response.body.usage.output_tokens / 1000) * 0.015;
        const totalCost = promptCost + completionCost;

        console.log('\nEstimated cost:');
        console.log(`  Input:  $${promptCost.toFixed(6)}`);
        console.log(`  Output: $${completionCost.toFixed(6)}`);
        console.log(`  Total:  $${totalCost.toFixed(6)}`);
      }

      console.log('\n' + '='.repeat(80));
      console.log('\n✅ Z.ai API is working correctly!\n');

      return {
        success: true,
        response: response.body,
        duration
      };
    } else {
      console.log('⚠️  Warning: Unexpected response format');
      console.log('\nFull response:');
      console.log(JSON.stringify(response.body, null, 2));
      console.log('\n' + '='.repeat(80) + '\n');

      return {
        success: false,
        error: 'Unexpected response format',
        response: response.body
      };
    }
  } catch (error) {
    console.error('❌ ERROR:\n');
    console.error(error.message);

    if (error.message.includes('401')) {
      console.log('\n💡 Tip: Check that your Z_AI_API_KEY is valid');
    } else if (error.message.includes('429')) {
      console.log('\n💡 Tip: Rate limit exceeded. Wait a moment and try again');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Tip: Check your internet connection');
    }

    console.log('\n' + '='.repeat(80) + '\n');
    process.exit(1);
  }
}

// Run test
testZaiAPI()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Unhandled error:', error);
    process.exit(1);
  });
