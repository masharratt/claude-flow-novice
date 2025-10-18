import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const wasmModule = require('../src/wasm-regex-engine/pkg/wasm_regex_engine.js');
const serializer = new wasmModule.MessageSerializer();

const testData = {
  id: 'msg_12345',
  type: 'test',
  timestamp: 1234567890,
};

console.log('Original data:', JSON.stringify(testData, null, 2));

const serialized = serializer.serializeMessage(testData);
console.log('\nSerialized:', serialized);

const deserialized = serializer.deserializeMessage(serialized);
console.log('\nDeserialized:', JSON.stringify(deserialized, null, 2));

console.log('\nComparison:');
console.log('id match:', deserialized.id === testData.id);
console.log('type match:', deserialized.type === testData.type);
console.log('timestamp match:', deserialized.timestamp === testData.timestamp);
