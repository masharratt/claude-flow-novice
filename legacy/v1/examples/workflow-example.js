/**
 * Workflow Example
 * 
 * This example demonstrates advanced workflow patterns including:
 * - Sequential processing
 * - Conditional branching
 * - Parallel execution
 * - Error handling in workflows
 */

import { ClaudeFlowNovice } from '../src/index.js';

// Initialize Claude Flow Novice
const flow = new ClaudeFlowNovice({
  logLevel: 'info',
  maxAgents: 15
});

// Create data validation agent
const validator = flow.createAgent({
  name: 'data-validator',
  description: 'Validates input data',
  handler: async (input) => {
    const { data, schema } = input;
    
    // Simple validation logic
    const errors = [];
    const warnings = [];
    
    if (!data) {
      errors.push('Data is required');
      return { valid: false, errors, warnings };
    }
    
    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in data)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }
    
    // Check data types
    if (schema.properties) {
      for (const [field, rules] of Object.entries(schema.properties)) {
        if (field in data) {
          if (rules.type === 'string' && typeof data[field] !== 'string') {
            errors.push(`Field ${field} must be a string`);
          }
          if (rules.type === 'number' && typeof data[field] !== 'number') {
            errors.push(`Field ${field} must be a number`);
          }
          if (rules.minLength && data[field].length < rules.minLength) {
            warnings.push(`Field ${field} is shorter than recommended`);
          }
        }
      }
    }
    
    const valid = errors.length === 0;
    
    return {
      valid,
      errors,
      warnings,
      data: valid ? data : null,
      timestamp: new Date().toISOString()
    };
  }
});

// Create data enrichment agent
const enricher = flow.createAgent({
  name: 'data-enricher',
  description: 'Enriches data with additional information',
  handler: async (input) => {
    const { data } = input;
    
    // Simulate data enrichment
    const enriched = {
      ...data,
      enrichedAt: new Date().toISOString(),
      enrichedBy: 'data-enricher',
      metadata: {
        version: '1.0',
        source: 'user-input',
        quality: 'standard'
      }
    };
    
    // Add computed fields
    if (data.name) {
      enriched.nameLength = data.name.length;
      enriched.nameWords = data.name.split(/\s+/).length;
    }
    
    if (data.email) {
      enriched.emailDomain = data.email.split('@')[1];
      enriched.emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
    }
    
    return {
      originalData: data,
      enrichedData: enriched,
      enrichmentFields: Object.keys(enriched).filter(key => !(key in data)),
      timestamp: new Date().toISOString()
    };
  }
});

// Create data transformation agent
const transformer = flow.createAgent({
  name: 'data-transformer',
  description: 'Transforms data into different formats',
  handler: async (input) => {
    const { data, targetFormat } = input;
    
    let transformed = {};
    
    switch (targetFormat) {
      case 'summary':
        transformed = {
          summary: {
            fields: Object.keys(data),
            fieldCount: Object.keys(data).length,
            hasEmail: !!data.email,
            hasName: !!data.name,
            lastUpdated: data.enrichedAt || new Date().toISOString()
          },
          format: 'summary'
        };
        break;
        
      case 'api':
        transformed = {
          id: data.id || `auto-${Date.now()}`,
          attributes: { ...data },
          type: 'user-data',
          relationships: {},
          links: {
            self: `/api/data/${data.id || 'new'}`
          },
          format: 'api'
        };
        break;
        
      case 'csv':
        const headers = Object.keys(data);
        const values = headers.map(header => data[header]);
        transformed = {
          headers,
          values,
          csvRow: values.map(v => `"${v}"`).join(','),
          format: 'csv'
        };
        break;
        
      default:
        transformed = { ...data, format: 'original' };
    }
    
    return {
      originalData: data,
      transformedData: transformed,
      targetFormat,
      timestamp: new Date().toISOString()
    };
  }
});

// Create quality check agent
const qualityChecker = flow.createAgent({
  name: 'quality-checker',
  description: 'Checks data quality and scores it',
  handler: async (input) => {
    const { data } = input;
    
    let score = 0;
    const maxScore = 100;
    const issues = [];
    
    // Completeness check (40 points)
    const requiredFields = ['name', 'email'];
    const presentFields = requiredFields.filter(field => data[field]);
    score += (presentFields.length / requiredFields.length) * 40;
    
    if (presentFields.length < requiredFields.length) {
      issues.push('Missing required fields');
    }
    
    // Validity check (30 points)
    let validityScore = 30;
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      validityScore -= 15;
      issues.push('Invalid email format');
    }
    if (data.name && data.name.length < 2) {
      validityScore -= 15;
      issues.push('Name too short');
    }
    score += Math.max(0, validityScore);
    
    // Consistency check (20 points)
    let consistencyScore = 20;
    if (data.name && data.email) {
      const nameInEmail = data.name.toLowerCase().split(' ')[0];
      if (data.email.toLowerCase().includes(nameInEmail)) {
        // Bonus points for consistency
        consistencyScore = 20;
      } else {
        consistencyScore = 10;
      }
    }
    score += consistencyScore;
    
    // Timeliness check (10 points)
    if (data.enrichedAt) {
      const age = Date.now() - new Date(data.enrichedAt).getTime();
      const ageHours = age / (1000 * 60 * 60);
      if (ageHours < 24) {
        score += 10;
      } else if (ageHours < 168) { // 1 week
        score += 5;
      }
    } else {
      issues.push('No timestamp found');
    }
    
    const quality = score >= 80 ? 'excellent' :
                   score >= 60 ? 'good' :
                   score >= 40 ? 'fair' : 'poor';
    
    return {
      data,
      qualityScore: Math.round(score),
      qualityLevel: quality,
      maxScore,
      issues,
      recommendations: generateRecommendations(issues, data),
      timestamp: new Date().toISOString()
    };
  }
});

// Create notification agent
const notifier = flow.createAgent({
  name: 'notifier',
  description: 'Sends notifications based on data processing results',
  handler: async (input) => {
    const { results, preferences } = input;
    
    const notifications = [];
    
    // Check quality score
    if (results.quality && results.quality.qualityScore < 60) {
      notifications.push({
        type: 'warning',
        message: `Data quality is ${results.quality.qualityLevel} (${results.quality.qualityScore}/100)`,
        priority: 'medium',
        channels: ['email', 'console']
      });
    }
    
    // Check for errors
    if (results.validation && !results.validation.valid) {
      notifications.push({
        type: 'error',
        message: `Data validation failed: ${results.validation.errors.join(', ')}`,
        priority: 'high',
        channels: ['email', 'sms', 'console']
      });
    }
    
    // Success notification
    if (results.validation && results.validation.valid && 
        results.quality && results.quality.qualityScore >= 80) {
      notifications.push({
        type: 'success',
        message: 'Data processed successfully with high quality',
        priority: 'low',
        channels: ['console']
      });
    }
    
    // Simulate sending notifications
    const sentNotifications = notifications.map(notification => ({
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sentAt: new Date().toISOString(),
      status: 'sent'
    }));
    
    return {
      notifications: sentNotifications,
      totalSent: sentNotifications.length,
      channels: [...new Set(sentNotifications.flatMap(n => n.channels))],
      timestamp: new Date().toISOString()
    };
  }
});

// Helper function for quality recommendations
function generateRecommendations(issues, data) {
  const recommendations = [];
  
  if (issues.includes('Missing required fields')) {
    recommendations.push('Add all required fields (name, email)');
  }
  
  if (issues.includes('Invalid email format')) {
    recommendations.push('Correct email format to user@domain.com');
  }
  
  if (issues.includes('Name too short')) {
    recommendations.push('Provide a full name (at least 2 characters)');
  }
  
  if (issues.includes('No timestamp found')) {
    recommendations.push('Add timestamp to track data freshness');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Data quality is good - no immediate actions needed');
  }
  
  return recommendations;
}

// Create comprehensive data processing workflow
const dataProcessingWorkflow = flow.createWorkflow()
  .addAgent(validator)
  .branch(
    (result) => result.valid,
    // If valid: continue with enrichment
    flow.createWorkflow()
      .addAgent(enricher)
      .addAgent(transformer)
      .addAgent(qualityChecker),
    // If invalid: skip to quality check with error info
    flow.createWorkflow()
      .addAgent(qualityChecker)
  )
  .addAgent(notifier);

// Test the workflow
async function testDataProcessingWorkflow() {
  console.log('🔄 Testing Data Processing Workflow\n');
  
  const testCases = [
    {
      name: 'Valid Complete Data',
      input: {
        data: {
          name: 'John Doe',
          email: 'john.doe@example.com',
          age: 30,
          company: 'Acme Corp'
        },
        schema: {
          required: ['name', 'email'],
          properties: {
            name: { type: 'string', minLength: 2 },
            email: { type: 'string' },
            age: { type: 'number' }
          }
        },
        targetFormat: 'summary'
      }
    },
    {
      name: 'Invalid Data',
      input: {
        data: {
          name: 'A',
          email: 'invalid-email'
        },
        schema: {
          required: ['name', 'email'],
          properties: {
            name: { type: 'string', minLength: 2 },
            email: { type: 'string' }
          }
        },
        targetFormat: 'api'
      }
    },
    {
      name: 'Minimal Valid Data',
      input: {
        data: {
          name: 'Jane Smith',
          email: 'jane@company.com'
        },
        schema: {
          required: ['name', 'email'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string' }
          }
        },
        targetFormat: 'csv'
      }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`📋 Test Case: ${testCase.name}`);
    console.log('─'.repeat(60));
    
    try {
      const results = await dataProcessingWorkflow.execute(testCase.input);
      
      console.log('\n📊 Workflow Results:');
      
      // Validation results
      if (results.validation) {
        console.log(`✅ Validation: ${results.validation.valid ? 'PASSED' : 'FAILED'}`);
        if (results.validation.errors.length > 0) {
          console.log(`   Errors: ${results.validation.errors.join(', ')}`);
        }
        if (results.validation.warnings.length > 0) {
          console.log(`   Warnings: ${results.validation.warnings.join(', ')}`);
        }
      }
      
      // Enrichment results
      if (results.enrichment) {
        console.log(`🔧 Enrichment: Added ${results.enrichment.enrichmentFields.length} fields`);
        console.log(`   New fields: ${results.enrichment.enrichmentFields.join(', ')}`);
      }
      
      // Transformation results
      if (results.transformation) {
        console.log(`🔄 Transformation: Converted to ${results.transformation.targetFormat} format`);
      }
      
      // Quality results
      if (results.quality) {
        console.log(`📈 Quality Score: ${results.quality.qualityScore}/${results.quality.maxScore} (${results.quality.qualityLevel})`);
        if (results.quality.issues.length > 0) {
          console.log(`   Issues: ${results.quality.issues.join(', ')}`);
        }
      }
      
      // Notification results
      if (results.notifications) {
        console.log(`📢 Notifications: ${results.notifications.totalSent} sent`);
        results.notifications.notifications.forEach(notif => {
          console.log(`   ${notif.type.toUpperCase()}: ${notif.message}`);
        });
      }
      
    } catch (error) {
      console.log(`❌ Workflow failed: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(70) + '\n');
  }
}

// Create parallel processing example
const parallelWorkflow = flow.createWorkflow()
  .parallel([
    validator,
    enricher,
    qualityChecker
  ])
  .addAgent(transformer)
  .addAgent(notifier);

async function testParallelWorkflow() {
  console.log('⚡ Testing Parallel Processing Workflow\n');
  
  const testData = {
    data: {
      name: 'Alice Johnson',
      email: 'alice@techcorp.com',
      role: 'Developer',
      department: 'Engineering'
    },
    schema: {
      required: ['name', 'email'],
      properties: {
        name: { type: 'string' },
        email: { type: 'string' }
      }
    },
    targetFormat: 'api'
  };
  
  console.log('🚀 Running agents in parallel...');
  const startTime = Date.now();
  
  try {
    const results = await parallelWorkflow.execute(testData);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`⏱️  Parallel execution completed in ${duration}ms\n`);
    
    console.log('📊 Combined Results:');
    Object.entries(results).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        console.log(`   ${key}: ${JSON.stringify(value).substring(0, 100)}...`);
      }
    });
    
  } catch (error) {
    console.log(`❌ Parallel workflow failed: ${error.message}`);
  }
}

// Run all workflow examples
async function runWorkflowExamples() {
  console.log('🚀 Claude Flow Novice - Workflow Examples\n');
  console.log('=' .repeat(70));
  
  await testDataProcessingWorkflow();
  await testParallelWorkflow();
  
  console.log('\n🎉 All workflow examples completed!');
  
  // Shutdown the system
  await flow.shutdown();
}

// Run the examples
if (import.meta.url === `file://${process.argv[1]}`) {
  runWorkflowExamples().catch(console.error);
}

export { testDataProcessingWorkflow, testParallelWorkflow };