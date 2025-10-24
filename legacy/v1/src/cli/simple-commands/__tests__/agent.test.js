/**
 * Tests for agent command
 */

import { jest } from '@jest/globals';
import { agentCommand } from '../agent.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

jest.mock('fs-extra');
jest.mock('ora');
jest.mock('chalk', () => ({
  default: {
    blue: jest.fn((str) => str),
    green: jest.fn((str) => str),
    yellow: jest.fn((str) => str),
    red: jest.fn((str) => str),
    cyan: jest.fn((str) => str),
    dim: jest.fn((str) => str),
    bold: jest.fn((str) => str),
  },
}));

describe('Agent Command', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let mockSpinner;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    mockSpinner = {
      start: jest.fn().mockReturnThis(),
      succeed: jest.fn().mockReturnThis(),
      fail: jest.fn().mockReturnThis(),
      info: jest.fn().mockReturnThis(),
      text: '',
    };
    ora.mockReturnValue(mockSpinner);

    jest.clearAllMocks();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('list subcommand', () => {
    jest.setTimeout(10000);
  test('should list available agent types', async () => { try {
      await agentCommand(['list'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.flat().join('\n');

      expect(output).toContain('Available Agent Types');
      expect(output).toContain('researcher');
      expect(output).toContain('coder');
      expect(output).toContain('analyst');
      expect(output).toContain('architect');
      expect(output).toContain('tester');
      expect(output).toContain('coordinator');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('spawn subcommand', () => {
    jest.setTimeout(10000);
  test('should spawn an agent with type', async () => { try {
      const swarmDir = path.join(process.cwd(), '.claude', 'swarm');
      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue({
        id: 'swarm-123',
        agents: [],
        status: 'active',
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      fs.writeJson.mockResolvedValue(undefined);

      await agentCommand(['spawn', 'researcher'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(mockSpinner.start).toHaveBeenCalledWith('Spawning researcher agent...');
      expect(mockSpinner.succeed).toHaveBeenCalled();
      expect(fs.writeJson).toHaveBeenCalled();

      const writeCall = fs.writeJson.mock.calls[0];
      expect(writeCall[1].agents).toHaveLength(1);
      expect(writeCall[1].agents[0].type).toBe('researcher');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should spawn agent with custom name', async () => { try {
      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue({
        id: 'swarm-123',
        agents: [],
        status: 'active',
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      fs.writeJson.mockResolvedValue(undefined);

      await agentCommand(['spawn', 'coder'], { name: 'CustomCoder' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const writeCall = fs.writeJson.mock.calls[0];
      expect(writeCall[1].agents[0].name).toBe('CustomCoder');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should error if swarm not initialized', async () => { try {
      fs.pathExists.mockResolvedValue(false);

      await agentCommand(['spawn', 'researcher'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(mockSpinner.fail).toHaveBeenCalledWith(
        expect.stringContaining('No active swarm found'),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should error for invalid agent type', async () => { try {
      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue({ agents: [] } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await agentCommand(['spawn', 'invalid-type'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid agent type'));
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('status subcommand', () => {
    jest.setTimeout(10000);
  test('should show agent status', async () => { try {
      const mockSwarmData = {
        id: 'swarm-123',
        agents: [
          {
            id: 'agent-1',
            name: 'Researcher',
            type: 'researcher',
            status: 'active',
            created: new Date().toISOString(),
            tasksCompleted: 5,
            currentTask: 'Analyzing data',
          },
          {
            id: 'agent-2',
            name: 'Coder',
            type: 'coder',
            status: 'idle',
            created: new Date().toISOString(),
            tasksCompleted: 3,
            currentTask: null,
          },
        ],
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(mockSwarmData);

      await agentCommand(['status'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Active Agents');
      expect(output).toContain('Researcher');
      expect(output).toContain('active');
      expect(output).toContain('Analyzing data');
      expect(output).toContain('Coder');
      expect(output).toContain('idle');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should show specific agent status', async () => { try {
      const mockSwarmData = {
        agents: [
          {
            id: 'agent-1',
            name: 'Researcher',
            type: 'researcher',
            status: 'active',
            metrics: {
              tasksCompleted: 10,
              avgCompletionTime: 5000,
              successRate: 0.95,
            },
          },
        ],
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(mockSwarmData);

      await agentCommand(['status', 'agent-1'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Agent Details');
      expect(output).toContain('Researcher');
      expect(output).toContain('Tasks Completed: 10');
      expect(output).toContain('Success Rate: 95%');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('remove subcommand', () => {
    jest.setTimeout(10000);
  test('should remove an agent', async () => { try {
      const mockSwarmData = {
        agents: [
          { id: 'agent-1', name: 'Researcher' },
          { id: 'agent-2', name: 'Coder' },
        ],
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(mockSwarmData);
      fs.writeJson.mockResolvedValue(undefined);

      await agentCommand(['remove', 'agent-1'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining('Agent agent-1 removed'),
      );

      const writeCall = fs.writeJson.mock.calls[0];
      expect(writeCall[1].agents).toHaveLength(1);
      expect(writeCall[1].agents[0].id).toBe('agent-2');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should error if agent not found', async () => { try {
      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue({ agents: [] } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await agentCommand(['remove', 'nonexistent'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(mockSpinner.fail).toHaveBeenCalledWith(
        expect.stringContaining('Agent nonexistent not found'),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('assign subcommand', () => {
    jest.setTimeout(10000);
  test('should assign task to agent', async () => { try {
      const mockSwarmData = {
        agents: [{ id: 'agent-1', name: 'Researcher', currentTask: null }],
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(mockSwarmData);
      fs.writeJson.mockResolvedValue(undefined);

      await agentCommand(['assign', 'agent-1', 'Research new algorithms'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining('Task assigned to agent-1'),
      );

      const writeCall = fs.writeJson.mock.calls[0];
      expect(writeCall[1].agents[0].currentTask).toBe('Research new algorithms');
      expect(writeCall[1].agents[0].status).toBe('working');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('help subcommand', () => {
    jest.setTimeout(10000);
  test('should show help when no arguments', async () => { try {
      await agentCommand([], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Agent Management');
      expect(output).toContain('USAGE:');
      expect(output).toContain('agent <subcommand>');
      expect(output).toContain('SUBCOMMANDS:');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should show help for help subcommand', async () => { try {
      await agentCommand(['help'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Agent Management');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('error handling', () => {
    jest.setTimeout(10000);
  test('should handle file read errors gracefully', async () => { try {
      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockRejectedValue(new Error('Permission denied'));

      await agentCommand(['status'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle invalid subcommands', async () => { try {
      await agentCommand(['invalid-subcommand'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown subcommand: invalid-subcommand'),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
