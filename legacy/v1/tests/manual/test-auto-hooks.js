// Test file for automatic hook triggering in claude-flow-novice
// This should trigger the enhanced post-edit hook automatically

function testAutoHooks() {
  console.log('Testing automatic hook system in claude-flow-novice - EDITED VIA CLAUDE TOOL');
  return {
    status: 'success',
    message: 'Enhanced hook test',
    features: ['TDD validation', 'Coverage analysis', 'Memory storage']
  };
}

module.exports = { testAutoHooks };