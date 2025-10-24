/**
 * Comprehensive Test Suite for CLAUDE.md Section 4 Updates
 * Validates all required elements for CFN Loop documentation completeness
 */

const fs = require('fs');
const path = require('path');

describe('CLAUDE.md Section 4 Updates Validation', () => {
  let claudeMdContent;
  
  beforeAll(() => {
    const filePath = path.join(__dirname, '../CLAUDE.md');
    claudeMdContent = fs.readFileSync(filePath, 'utf8');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('4.3 Dedicated CFN Coordinators Subsection', () => {
    jest.setTimeout(10000);
  test('should have dedicated subsection 4.3 for CFN Coordinators', () => {
      expect(claudeMdContent).toContain('### 4.3 Dedicated CFN Coordinators');
      expect(claudeMdContent).toContain('**Mode-Based Coordinator Selection**');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should document coordinator spawning pattern', () => {
      expect(claudeMdContent).toContain('**Coordinator Spawning Pattern**');
      expect(claudeMdContent).toContain('node src/cli/hybrid-routing/spawn-coordinator.js');
      expect(claudeMdContent).toContain('--mode=mvp --sprint-id=auth-sprint-001');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should document auto-phase-launch pattern', () => {
      expect(claudeMdContent).toContain('**Auto-Phase-Launch Pattern**');
      expect(claudeMdContent).toContain('Coordinators autonomously execute Loop 3→2→4');
      expect(claudeMdContent).toContain('Loop 3: Spawn workers');
      expect(claudeMdContent).toContain('Loop 2: Coordinate validators');
      expect(claudeMdContent).toContain('Loop 4: Product Owner decision');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should document single-coordinator-per-sprint pattern', () => {
      expect(claudeMdContent).toContain('**Single-Coordinator-Per-Sprint Pattern**');
      expect(claudeMdContent).toContain('One coordinator handles entire sprint lifecycle');
      expect(claudeMdContent).toContain('Persistent state across all phases');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Mode-Based Coordinator Table', () => {
    jest.setTimeout(10000);
  test('should contain complete coordinator table with all required columns', () => {
      const tableRegex = /\| Coordinator \| Mode \| Focus \| Cost Target \| Phase Duration \|/;
      expect(tableRegex.jest.setTimeout(10000);
  test(claudeMdContent)).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should have all three coordinator types documented', () => {
      expect(claudeMdContent).toContain('cfn-coordinator-mvp');
      expect(claudeMdContent).toContain('cfn-coordinator-standard');
      expect(claudeMdContent).toContain('cfn-coordinator-enterprise');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should include correct cost targets for each mode', () => {
      expect(claudeMdContent).toContain('<$1.00/phase'); // MVP
      expect(claudeMdContent).toContain('$2.00/phase');  // Standard
      expect(claudeMdContent).toContain('$5.00/phase');  // Enterprise
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should include correct phase durations for each mode', () => {
      expect(claudeMdContent).toContain('15 minutes'); // MVP
      expect(claudeMdContent).toContain('30 minutes'); // Standard
      expect(claudeMdContent).toContain('60 minutes'); // Enterprise
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Return-to-Chat Triggers', () => {
    jest.setTimeout(10000);
  test('should clearly list return-to-chat triggers', () => {
      expect(claudeMdContent).toContain('**Return-to-Chat Triggers**');
      expect(claudeMdContent).toContain('Coordinators return to main chat only for:');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should document human decision triggers', () => {
      expect(claudeMdContent).toContain('1. **Human Decision Required**');
      expect(claudeMdContent).toContain('Major architectural changes');
      expect(claudeMdContent).toContain('Budget/timeline adjustments');
      expect(claudeMdContent).toContain('Critical technical blockers');
      expect(claudeMdContent).toContain('Stakeholder approval needed');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should document sprint completion triggers', () => {
      expect(claudeMdContent).toContain('2. **Sprint Complete**');
      expect(claudeMdContent).toContain('All planned phases executed');
      expect(claudeMdContent).toContain('Deliverables ready for review');
      expect(claudeMdContent).toContain('Next iteration planning required');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should include return-to-chat trigger logic example', () => {
      expect(claudeMdContent).toContain('shouldReturnToChat');
      expect(claudeMdContent).toContain('humanDecision');
      expect(claudeMdContent).toContain('sprintComplete');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Auto-Injection Documentation', () => {
    jest.setTimeout(10000);
  test('should include coordinator auto-injection example', () => {
      expect(claudeMdContent).toContain('**Coordinator Auto-Injection**');
      expect(claudeMdContent).toContain('After each Loop 4 PROCEED decision');
      expect(claudeMdContent).toContain('auto-injects mode-specific instructions');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should include MVP coordinator auto-injection example', () => {
      expect(claudeMdContent).toContain('MVP coordinator auto-injection example');
      expect(claudeMdContent).toContain('## MVP Mode Instructions for Next Phase');
      expect(claudeMdContent).toContain('Speed Over Perfection');
      expect(claudeMdContent).toContain('Core Features Only');
      expect(claudeMdContent).toContain('Rapid Testing');
      expect(claudeMdContent).toContain('Quick Validation');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should include cost constraints in auto-injection', () => {
      expect(claudeMdContent).toContain('Phase Budget: <$1.00 total');
      expect(claudeMdContent).toContain('Worker Count: 2-3 maximum');
      expect(claudeMdContent).toContain('Timeline: 15 minutes per phase');
      expect(claudeMdContent).toContain('Provider: z.ai (cost optimization)');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Coordinator Telemetry Documentation', () => {
    jest.setTimeout(10000);
  test('should include coordinator telemetry example', () => {
      expect(claudeMdContent).toContain('**Coordinator Telemetry**');
      expect(claudeMdContent).toContain('Each coordinator tracks and reports phase metrics');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should include complete telemetry structure', () => {
      expect(claudeMdContent).toContain('const coordinatorMetrics');
      expect(claudeMdContent).toContain('phaseId');
      expect(claudeMdContent).toContain('mode');
      expect(claudeMdContent).toContain('coordinator');
      expect(claudeMdContent).toContain('loop3');
      expect(claudeMdContent).toContain('loop2');
      expect(claudeMdContent).toContain('totalCost');
      expect(claudeMdContent).toContain('totalDuration');
      expect(claudeMdContent).toContain('savingsVsPureClaude');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should include specific telemetry values', () => {
      expect(claudeMdContent).toContain('avgConfidence: 0.75');
      expect(claudeMdContent).toContain('gateThreshold: 0.70');
      expect(claudeMdContent).toContain('consensus: 0.85');
      expect(claudeMdContent).toContain('consensusThreshold: 0.80');
      expect(claudeMdContent).toContain('savingsVsPureClaude: 0.96');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Detailed Mode Instructions Reference', () => {
    jest.setTimeout(10000);
  test('should update Detailed Mode Instructions to reference coordinator profiles', () => {
      expect(claudeMdContent).toContain('**Detailed Mode Instructions**');
      expect(claudeMdContent).toContain('See coordinator profiles for complete spawn patterns');
      expect(claudeMdContent).toContain('Redis pub/sub coordination');
      expect(claudeMdContent).toContain('SQLite memory patterns');
      expect(claudeMdContent).toContain('git commit templates');
      expect(claudeMdContent).toContain('retry strategies');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should document coordinator expertise and auto-injection', () => {
      expect(claudeMdContent).toContain('Each coordinator maintains mode-specific expertise');
      expect(claudeMdContent).toContain('auto-injects instructions for next phases');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Integration with Existing CFN Loop Structure', () => {
    jest.setTimeout(10000);
  test('should maintain CFN Loop 4.1 structure', () => {
      expect(claudeMdContent).toContain('### 4.1 Loop Structure');
      expect(claudeMdContent).toContain('Loop 0: Epic/Sprint orchestration');
      expect(claudeMdContent).toContain('Loop 1: Phase execution');
      expect(claudeMdContent).toContain('Loop 2: Consensus validation');
      expect(claudeMdContent).toContain('Loop 3: Primary swarm implementation');
      expect(claudeMdContent).toContain('Loop 4: Product Owner decision gate');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should maintain CFN Loop 4.2 modes', () => {
      expect(claudeMdContent).toContain('### 4.2 CFN Loop Modes');
      expect(claudeMdContent).toContain('**Mode Selection**');
      expect(claudeMdContent).toContain('**Mode Comparison**');
      expect(claudeMdContent).toContain('**Auto-Detection**');
      expect(claudeMdContent).toContain('**Mode Storage**');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should ensure proper subsection ordering', () => {
      const section4Match = claudeMdContent.match(/## 4) CFN Loop \(Single Section\)([\s\S]*?)(?=## 5|$)/);
      expect(section4Match).toBeTruthy();
      
      const section4Content = section4Match[1];
      expect(section4Content.indexOf('### 4.1')).toBeLessThan(section4Content.indexOf('### 4.2'));
      expect(section4Content.indexOf('### 4.2')).toBeLessThan(section4Content.indexOf('### 4.3'));
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Content Quality and Completeness', () => {
    jest.setTimeout(10000);
  test('should have no placeholder content in section 4.3', () => {
      const section43Match = claudeMdContent.match(/### 4\.3 Dedicated CFN Coordinators([\s\S]*?)(?=###|$)/);
      if (section43Match) {
        const section43Content = section43Match[1];
        expect(section43Content).not.toContain('TODO');
        expect(section43Content).not.toContain('[PLACEHOLDER]');
        expect(section43Content).not.toContain('Coming soon');
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should include code examples for all patterns', () => {
      expect(claudeMdContent).toContain('```bash');
      expect(claudeMdContent).toContain('```javascript');
      expect(claudeMdContent).toContain('spawn-coordinator.js');
      expect(claudeMdContent).toContain('spawn-workers.js');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should have consistent formatting and structure', () => {
      // Check for consistent bold formatting
      expect(claudeMdContent).toContain('**Coordinator Spawning Pattern**');
      expect(claudeMdContent).toContain('**Auto-Phase-Launch Pattern**');
      expect(claudeMdContent).toContain('**Single-Coordinator-Per-Sprint Pattern**');
      
      // Check for numbered lists
      expect(claudeMdContent).toContain('1. **Loop 3**');
      expect(claudeMdContent).toContain('2. **Loop 2**');
      expect(claudeMdContent).toContain('3. **Loop 4**');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Cross-References and Integration', () => {
    jest.setTimeout(10000);
  test('should reference coordinator patterns from other sections', () => {
      expect(claudeMdContent).toContain('cfn-coordinator-mvp');
      expect(claudeMdContent).toContain('cfn-coordinator-standard');
      expect(claudeMdContent).toContain('cfn-coordinator-enterprise');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should integrate with existing hybrid routing documentation', () => {
      expect(claudeMdContent).toContain('Hybrid CLI-Based Routing');
      expect(claudeMdContent).toContain('spawn-workers.js');
      expect(claudeMdContent).toContain('--provider zai');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

describe('Section 4 Overall Structure Validation', () => {
  let claudeMdContent;
  
  beforeAll(() => {
    const filePath = path.join(__dirname, '../CLAUDE.md');
    claudeMdContent = fs.readFileSync(filePath, 'utf8');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should have all three subsections in correct order', () => {
    expect(claudeMdContent).toContain('### 4.1 Loop Structure');
    expect(claudeMdContent).toContain('### 4.2 CFN Loop Modes');
    expect(claudeMdContent).toContain('### 4.3 Dedicated CFN Coordinators');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should maintain consistent markdown formatting', () => {
    const lines = claudeMdContent.split('\n');
    const section4Lines = [];
    let inSection4 = false;
    
    for (const line of lines) {
      if (line.startsWith('## 4) CFN Loop')) {
        inSection4 = true;
      } else if (line.startsWith('## 5)')) {
        break;
      } else if (inSection4) {
        section4Lines.push(line);
      }
    }
    
    // Check for proper heading hierarchy
    const h3Count = section4Lines.filter(line => line.startsWith('### ')).length;
    expect(h3Count).toBeGreaterThanOrEqual(3);
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should have no duplicate subsection numbers', () => {
    const subsectionMatches = claudeMdContent.match(/### 4\.\d+/g);
    const subsectionNumbers = subsectionMatches || [];
    const uniqueNumbers = [...new Set(subsectionNumbers)];
    expect(uniqueNumbers.length).toBe(subsectionNumbers.length);
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});