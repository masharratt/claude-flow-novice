const path = require('path');
const nm = './node_modules';

try {
  const nerdamer = require(path.join(nm, 'nerdamer'));
  console.log('nerdamer loaded:', typeof nerdamer);
  
  // Try to load additional modules
  require(path.join(nm, 'nerdamer', 'Algebra.js'));
  console.log('Algebra.js loaded');
  
  require(path.join(nm, 'nerdamer', 'Solve.js'));
  console.log('Solve.js loaded');
  
  require(path.join(nm, 'nerdamer', 'Extra.js'));
  console.log('Extra.js loaded');
  
  // Try solving
  const result = nerdamer.solve('x + 2 = 5', 'x');
  console.log('Result:', result.toString());
  
} catch(e) {
  console.error('Error:', e.message);
  console.error('Stack:', e.stack);
}
