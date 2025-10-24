const fs = require('fs');
const path = require('path');

describe('CLAUDE.md Section 4 Validation', () => {
  let content;

  beforeAll(() => {
    const filePath = path.join(__dirname, '..', 'CLAUDE.md');
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('4.3 Dedicated CFN Coordinators', () => {
    jest.setTimeout(10000);
  test('should have subsection 4.3 "Dedicated CFN Coordinators"', () => {
      expect(content).toContain('### 4.3 Dedicated CFN Coordinators');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should contain mode-based coordinator table', () => {
      const tablePattern = /\| Coordinator \| Mode \| Focus \| Cost Target \| Phase Duration \|[\s\S]*?\| cfn-coordinator-mvp \| MVP \|[\s\S]*?\| cfn-coordinator-standard \| Standard \|[\s\S]*?\| cfn-coordinator-enterprise \| Enterprise \|/m;
      expect(content).toMatch(tablePattern);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should document coordinator spawning pattern', () => {
      expect(content).toContain('Coordinator Spawning Pattern');
      expect(content).toContain('node src/cli/hybrid-routing/spawn-coordinator.js');
      expect(content).toContain('--mode=mvp --sprint-id=auth-sprint-001');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should explain auto-phase-launch pattern', () => {
      expect(content).toContain('Auto-Phase-Launch Pattern');
      expect(content).toContain('Loop 3→2→4 for each phase');
      expect(content).toContain('Spawn workers (2-5 based on mode)');
      expect(content).toContain('Coordinate validators (2-4 based on mode)');
      expect(content).toContain('Product Owner decision');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should document single-coordinator-per-sprint pattern', () => {
      expect(content).toContain('Single-Coordinator-Per-Sprint Pattern');
      expect(content).toContain('One coordinator handles entire sprint lifecycle');
      expect(content).toContain('Persistent state across all phases');
      expect(content).toContain('Mode-specific parameter enforcement');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should list return-to-chat triggers clearly', () => {
      expect(content).toContain('Return-to-Chat Triggers');
      expect(content).toContain('Human Decision Required');
      expect(content).toContain('Major architectural changes');
      expect(content).toContain('Budget/timeline adjustments');
      expect(content).toContain('Critical technical blockers');
      expect(content).toContain('Stakeholder approval needed');
      expect(content).toContain('Sprint Complete');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should include auto-injection example', () => {
      expect(content).toContain('Coordinator Auto-Injection');
      expect(content).toContain('MVP coordinator auto-injection example');
      expect(content).toContain('## MVP Mode Instructions for Next Phase');
      expect(content).toContain('Speed Over Perfection');
      expect(content).toContain('Core Features Only');
      expect(content).toContain('Phase Budget: <$1.00 total');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should present coordinator telemetry example', () => {
      expect(content).toContain('Coordinator Telemetry');
      expect(content).toContain('const coordinatorMetrics = {');
      expect(content).toContain('phaseId: \'user-auth-mvp\'');
      expect(content).toContain('mode: \'mvp\'');
      expect(content).toContain('coordinator: \'cfn-coordinator-mvp\'');
      expect(content).toContain('loop3: {');
      expect(content).toContain('loop2: {');
      expect(content).toContain('totalCost: 0.35');
      expect(content).toContain('savingsVsPureClaude: 0.96');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Detailed Mode Instructions Reference', () => {
    jest.setTimeout(10000);
  test('should update "Detailed Mode Instructions" to reference coordinator profiles', () => {
      expect(content).toContain('**Detailed Mode Instructions**:');
      expect(content).toContain('See coordinator profiles for complete spawn patterns');
      expect(content).toContain('Redis pub/sub coordination');
      expect(content).toContain('SQLite memory patterns');
      expect(content).toContain('git commit templates');
      expect(content).toContain('Each coordinator maintains mode-specific expertise');
      expect(content).toContain('auto-injects instructions for next phases');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Section 4 Structure and Content', () => {
    jest.setTimeout(10000);
  test('should have proper section hierarchy', () => {
      expect(content).toContain('## 4) CFN Loop (Single Section)');
      expect(content).toContain('### 4.1 Loop Structure');
      expect(content).toContain('### 4.2 CFN Loop Modes');
      expect(content).toContain('### 4.3 Dedicated CFN Coordinators');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should maintain consistent formatting', () => {
      // Check for consistent markdown formatting
      const codeBlockCount = (content.match(/```/g) || []).length;
      expect(codeBlockCount % 2).toBe(0); // Even number of backticks

      // Check for proper table formatting
      expect(content).toContain('| Coordinator | Mode | Focus |');
      expect(content).toContain('| Mode | Best For | Gate |');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should have complete mode comparison table', () => {
      expect(content).toContain('| **MVP** | Prototypes, MVPs | ≥0.70 | ≥0.80 | 5 | 2 | Single | No |');
      expect(content).toContain('| **Standard** | General features | ≥0.75 | ≥0.90 | 10 | 4 | Single | No |');
      expect(content).toContain('| **Enterprise** | Production systems | ≥0.75 | ≥0.95 | 15 | 4 | 4-person board | Yes (≥0.85) |');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Integration with Existing CFN Loop Content', () => {
    jest.setTimeout(10000);
  test('should maintain consistency with existing CFN loop patterns', () => {
      expect(content).toContain('Loop 0: Epic/Sprint orchestration');
      expect(content).toContain('Loop 1: Phase execution');
      expect(content).toContain('Loop 2: Consensus validation');
      expect(content).toContain('Loop 3: Primary swarm implementation');
      expect(content).toContain('Loop 4: Product Owner decision gate');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should preserve SQLite persistence patterns', () => {
      expect(content).toContain('SQLite Persistence (Dual-Layer)');
      expect(content).toContain('Redis: Active coordination');
      expect(content).toContain('SQLite: Persistent state');
      expect(content).toContain('cfn/phase:{id}/loop3/{agentId}/confidence');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});