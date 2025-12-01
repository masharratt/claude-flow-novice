/**
 * Trigger Task via API
 *
 * Triggers a Trigger.dev v4 task using the HTTP API.
 *
 * Usage:
 *   node trigger-task.mjs <taskId> <payloadJSON>
 *
 * Example:
 *   node trigger-task.mjs test-zai-agent '{"testId":"single-test","outputDir":"/tmp/trigger-single-test"}'
 */

import https from 'https';
import http from 'http';

const TRIGGER_API_URL = process.env.TRIGGER_API_URL || 'http://localhost:8030';
const TRIGGER_SECRET_KEY = process.env.TRIGGER_SECRET_KEY || 'b412a4975b27d4f16c4c784cad93b31d5458ef785490fd4c6d2d9d29495d3bfc';

async function triggerTask(taskId, payload) {
  const url = new URL(`/api/v1/tasks/${taskId}/trigger`, TRIGGER_API_URL);

  const timestamp = new Date().getTime();
  const random = Math.random().toString(36).substring(7);

  const body = JSON.stringify({
    payload: payload,
    options: {
      idempotencyKey: `trigger-${timestamp}-${random}`
    }
  });

  console.log('Triggering task:', taskId);
  console.log('URL:', url.toString());
  console.log('Payload:', JSON.stringify(payload, null, 2));

  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${TRIGGER_SECRET_KEY}`,
      }
    }, (res) => {
      let data = '';

      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('Response status:', res.statusCode);
        console.log('Response headers:', res.headers);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            console.log('Success! Run ID:', result.id || result.runId || 'unknown');
            console.log('Full response:', JSON.stringify(result, null, 2));
            resolve(result);
          } catch (err) {
            console.log('Response body:', data);
            resolve({ rawResponse: data });
          }
        } else {
          console.error('Error response:', data);
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Main
const [taskId, payloadStr] = process.argv.slice(2);

if (!taskId || !payloadStr) {
  console.error('Usage: node trigger-task.mjs <taskId> <payloadJSON>');
  console.error('Example: node trigger-task.mjs test-zai-agent \'{"testId":"single-test","outputDir":"/tmp/trigger-single-test"}\'');
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(payloadStr);
} catch (err) {
  console.error('Invalid JSON payload:', err.message);
  process.exit(1);
}

triggerTask(taskId, payload)
  .then(() => {
    console.log('\n✅ Task triggered successfully!');
    console.log('Check http://localhost:8030 to view run status');
  })
  .catch((err) => {
    console.error('\n❌ Failed to trigger task:', err.message);
    process.exit(1);
  });
