/**
 * Basic Agent Example
 * 
 * This example demonstrates how to create and use a simple agent
 * that processes text input and provides basic analysis.
 */

import { ClaudeFlowNovice } from '../src/index.js';

// Initialize Claude Flow Novice
const flow = new ClaudeFlowNovice({
  logLevel: 'info'
});

// Create a text analysis agent
const textAnalyzer = flow.createAgent({
  name: 'text-analyzer',
  description: 'Analyzes text and provides basic statistics',
  handler: async (input) => {
    const { text, options = {} } = input;
    
    if (!text || typeof text !== 'string') {
      throw new Error('Valid text input is required');
    }
    
    // Basic text analysis
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s/g, '').length;
    
    // Advanced analysis
    const wordFrequency = {};
    words.forEach(word => {
      const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanWord) {
        wordFrequency[cleanWord] = (wordFrequency[cleanWord] || 0) + 1;
      }
    });
    
    // Find most common words
    const sortedWords = Object.entries(wordFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
    
    // Calculate readability score (simplified)
    const avgWordsPerSentence = words.length / sentences.length;
    const avgCharsPerWord = charactersNoSpaces / words.length;
    const readabilityScore = Math.max(0, Math.min(100, 
      100 - (avgWordsPerSentence * 2 + avgCharsPerWord * 0.5)
    ));
    
    return {
      summary: {
        words: words.length,
        sentences: sentences.length,
        characters,
        charactersNoSpaces,
        paragraphs: text.split(/\n\n+/).filter(p => p.trim().length > 0).length
      },
      analysis: {
        averageWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
        averageCharsPerWord: Math.round(avgCharsPerWord * 10) / 10,
        readabilityScore: Math.round(readabilityScore),
        readabilityLevel: readabilityScore > 70 ? 'Easy' : 
                         readabilityScore > 50 ? 'Medium' : 'Difficult'
      },
      topWords: sortedWords.map(([word, count]) => ({ word, count })),
      timestamp: new Date().toISOString()
    };
  },
  onError: async (error, input) => {
    console.error(`Text analyzer failed: ${error.message}`);
    return {
      error: error.message,
      input: input.text ? 'Text provided' : 'No text provided',
      timestamp: new Date().toISOString()
    };
  }
});

// Test the agent with different inputs
async function testTextAnalyzer() {
  console.log('🔍 Testing Text Analyzer Agent\n');
  
  const testCases = [
    {
      name: 'Simple Text',
      input: {
        text: 'Hello world! This is a simple test. How are you today?'
      }
    },
    {
      name: 'Longer Paragraph',
      input: {
        text: `Artificial intelligence is transforming the way we work and live. 
        Machine learning algorithms can now process vast amounts of data, 
        identify patterns, and make predictions with remarkable accuracy. 
        From healthcare to finance, AI applications are revolutionizing industries 
        and creating new opportunities for innovation and growth.`
      }
    },
    {
      name: 'Invalid Input',
      input: {
        text: ''
      }
    },
    {
      name: 'No Text',
      input: {}
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`📝 Test: ${testCase.name}`);
    console.log('─'.repeat(50));
    
    try {
      const result = await textAnalyzer.execute(testCase.input);
      
      if (result.error) {
        console.log(`❌ Error: ${result.error}`);
      } else {
        console.log(`📊 Summary:`);
        console.log(`   Words: ${result.summary.words}`);
        console.log(`   Sentences: ${result.summary.sentences}`);
        console.log(`   Characters: ${result.summary.characters}`);
        console.log(`   Paragraphs: ${result.summary.paragraphs}`);
        console.log(`\n📈 Analysis:`);
        console.log(`   Avg Words/Sentence: ${result.analysis.averageWordsPerSentence}`);
        console.log(`   Readability: ${result.analysis.readabilityLevel} (${result.analysis.readabilityScore}/100)`);
        console.log(`\n🔝 Top Words:`);
        result.topWords.forEach(({ word, count }) => {
          console.log(`   ${word}: ${count}`);
        });
      }
    } catch (error) {
      console.log(`💥 Unexpected error: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }
}

// Create a sentiment analysis agent
const sentimentAnalyzer = flow.createAgent({
  name: 'sentiment-analyzer',
  description: 'Analyzes text sentiment',
  handler: async (input) => {
    const { text } = input;
    
    // Simple sentiment word lists
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'happy', 'joy', 'success'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'sad', 'angry', 'fail', 'failure', 'poor'];
    
    const words = text.toLowerCase().split(/\s+/);
    let positiveCount = 0;
    let negativeCount = 0;
    
    words.forEach(word => {
      const cleanWord = word.replace(/[^a-z]/g, '');
      if (positiveWords.includes(cleanWord)) positiveCount++;
      if (negativeWords.includes(cleanWord)) negativeCount++;
    });
    
    const totalSentimentWords = positiveCount + negativeCount;
    let sentiment = 'neutral';
    let score = 0;
    
    if (totalSentimentWords > 0) {
      score = (positiveCount - negativeCount) / totalSentimentWords;
      if (score > 0.2) sentiment = 'positive';
      else if (score < -0.2) sentiment = 'negative';
    }
    
    return {
      sentiment,
      score: Math.round(score * 100) / 100,
      positiveWords: positiveCount,
      negativeWords: negativeCount,
      confidence: totalSentimentWords > 0 ? Math.min(totalSentimentWords / 5, 1) : 0,
      timestamp: new Date().toISOString()
    };
  }
});

// Test sentiment analyzer
async function testSentimentAnalyzer() {
  console.log('💭 Testing Sentiment Analyzer Agent\n');
  
  const testTexts = [
    'I love this product! It works great and makes me happy.',
    'This is terrible. I hate it and it makes me angry.',
    'The weather is okay today. Nothing special.',
    'Amazing service! Excellent quality and fantastic support. Wonderful experience!'
  ];
  
  for (const text of testTexts) {
    console.log(`📝 Analyzing: "${text}"`);
    
    const result = await sentimentAnalyzer.execute({ text });
    
    console.log(`💭 Sentiment: ${result.sentiment} (${result.score > 0 ? '+' : ''}${result.score})`);
    console.log(`📊 Positive words: ${result.positiveWords}, Negative words: ${result.negativeWords}`);
    console.log(`🎯 Confidence: ${Math.round(result.confidence * 100)}%`);
    console.log('\n' + '-'.repeat(50) + '\n');
  }
}

// Create a combined workflow
const textAnalysisWorkflow = flow.createWorkflow()
  .addAgent(textAnalyzer)
  .addAgent(sentimentAnalyzer);

// Test the workflow
async function testWorkflow() {
  console.log('🔄 Testing Combined Workflow\n');
  
  const sampleText = `I absolutely love working with Claude Flow Novice! 
  It's an amazing tool that makes building AI agents so much easier. 
  The documentation is great and the examples are wonderful. 
  However, I did encounter some issues with the setup process, 
  which was a bit frustrating. Overall though, it's a fantastic experience!`;
  
  console.log(`📝 Analyzing text: "${sampleText.substring(0, 100)}..."`);
  console.log('─'.repeat(60));
  
  try {
    const results = await textAnalysisWorkflow.execute({ text: sampleText });
    
    console.log('\n📊 Text Analysis Results:');
    const textResults = results[0];
    console.log(`   Words: ${textResults.summary.words}`);
    console.log(`   Readability: ${textResults.analysis.readabilityLevel}`);
    
    console.log('\n💭 Sentiment Analysis Results:');
    const sentimentResults = results[1];
    console.log(`   Sentiment: ${sentimentResults.sentiment} (${sentimentResults.score})`);
    console.log(`   Confidence: ${Math.round(sentimentResults.confidence * 100)}%`);
    
    console.log('\n✅ Workflow completed successfully!');
    
  } catch (error) {
    console.log(`❌ Workflow failed: ${error.message}`);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Claude Flow Novice - Basic Agent Examples\n');
  console.log('=' * 60);
  
  await testTextAnalyzer();
  await testSentimentAnalyzer();
  await testWorkflow();
  
  console.log('\n🎉 All tests completed!');
  
  // Shutdown the system
  await flow.shutdown();
}

// Run the examples
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { testTextAnalyzer, testSentimentAnalyzer, testWorkflow };