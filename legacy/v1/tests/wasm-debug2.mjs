import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const wasmModule = require('../src/wasm-regex-engine/pkg/wasm_regex_engine.js');

const testData = {
  id: 'msg_12345',
  type: 'test',
  timestamp: 1234567890,
};

console.log('Testing standalone quickSerialize/quickDeserialize functions:\n');
console.log('Original data:', JSON.stringify(testData, null, 2));

try {
  const serialized = wasmModule.quickSerialize(testData);
  console.log('\nSerialized:', serialized);

  const deserialized = wasmModule.quickDeserialize(serialized);
  console.log('\nDeserialized:', JSON.stringify(deserialized, null, 2));

  console.log('\nComparison:');
  console.log('id match:', deserialized.id === testData.id);
  console.log('type match:', deserialized.type === testData.type);
  console.log('timestamp match:', deserialized.timestamp === testData.timestamp);
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
}

console.log('\n\nTesting MessageSerializer class:\n');

try {
  const serializer = new wasmModule.MessageSerializer();
  console.log('Serializer created');

  const serialized = serializer.serializeMessage(testData);
  console.log('Serialized:', serialized);

  const deserialized = serializer.deserializeMessage(serialized);
  console.log('Deserialized:', JSON.stringify(deserialized, null, 2));
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
}
