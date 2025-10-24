/**
 * Tests for swarm command
 */

import { jest } from '@jest/globals';
import { swarmCommand } from '../swarm.js';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import ora from 'ora';

jest.mock('fs-extra');
jest.mock('child_process');
jest.mock('ora');

describe('Swarm Command', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let mockSpinner;
  let mockSpawnProcess;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    mockSpinner = {
      start: jest.fn().mockReturnThis(),
      succeed: jest.fn().mockReturnThis(),
      fail: jest.fn().mockReturnThis(),
      info: jest.fn().mockReturnThis(),
      warn: jest.fn().mockReturnThis(),
      text: '',
    };
    ora.mockReturnValue(mockSpinner);

    mockSpawnProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
    };
    spawn.mockReturnValue(mockSpawnProcess);

    jest.clearAllMocks();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('main swarm command', () => {
    jest.setTimeout(10000);
  test('should initialize swarm with objective', async () => { try {
      const swarmDir = path.join(process.cwd(), '.claude', 'swarm');
      fs.ensureDir.mockResolvedValue(undefined);
      fs.writeJson.mockResolvedValue(undefined);

      // Mock spawn process events
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 100);
        }
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await swarmCommand(['Build a REST API'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(mockSpinner.start).toHaveBeenCalledWith('Initializing swarm...');
      expect(fs.ensureDir).toHaveBeenCalledWith(swarmDir);

      const writeJsonCall = fs.writeJson.mock.calls[0];
      expect(writeJsonCall[0]).toBe(path.join(swarmDir, 'swarm.json'));
      expect(writeJsonCall[1]).toMatchObject({
        objective: 'Build a REST API',
        status: 'initializing',
        topology: 'hierarchical',
        strategy: 'adaptive',
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle custom strategy', async () => { try {
      fs.ensureDir.mockResolvedValue(undefined);
      fs.writeJson.mockResolvedValue(undefined);

      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') callback(0);
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await swarmCommand(['Research task'], { strategy: 'research' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const writeJsonCall = fs.writeJson.mock.calls[0];
      expect(writeJsonCall[1].strategy).toBe('research');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle custom topology mode', async () => { try {
      fs.ensureDir.mockResolvedValue(undefined);
      fs.writeJson.mockResolvedValue(undefined);

      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') callback(0);
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await swarmCommand(['Task'], { mode: 'mesh' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const writeJsonCall = fs.writeJson.mock.calls[0];
      expect(writeJsonCall[1].topology).toBe('mesh');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should set max agents', async () => { try {
      fs.ensureDir.mockResolvedValue(undefined);
      fs.writeJson.mockResolvedValue(undefined);

      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') callback(0);
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await swarmCommand(['Task'], { 'max-agents': '10' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const writeJsonCall = fs.writeJson.mock.calls[0];
      expect(writeJsonCall[1].maxAgents).toBe(10);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should enable parallel execution', async () => { try {
      fs.ensureDir.mockResolvedValue(undefined);
      fs.writeJson.mockResolvedValue(undefined);

      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') callback(0);
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await swarmCommand(['Task'], { parallel: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const writeJsonCall = fs.writeJson.mock.calls[0];
      expect(writeJsonCall[1].parallel).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should enable monitoring', async () => { try {
      fs.ensureDir.mockResolvedValue(undefined);
      fs.writeJson.mockResolvedValue(undefined);

      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') callback(0);
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await swarmCommand(['Task'], { monitor: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(spawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--monitor']),
        expect.any(Object),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('swarm status', () => {
    jest.setTimeout(10000);
  test('should show swarm status', async () => { try {
      const mockSwarmData = {
        id: 'swarm-123',
        objective: 'Build API',
        status: 'active',
        topology: 'hierarchical',
        agents: [
          { id: 'agent-1', type: 'researcher', status: 'active' },
          { id: 'agent-2', type: 'coder', status: 'working' },
        ],
        metrics: {
          startTime: new Date(Date.now() - 300000).toISOString(),
          tasksCompleted: 15,
          tasksInProgress: 3,
          tasksPending: 7,
        },
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(mockSwarmData);

      await swarmCommand(['status'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Swarm Status');
      expect(output).toContain('Build API');
      expect(output).toContain('active');
      expect(output).toContain('hierarchical');
      expect(output).toContain('2 agents');
      expect(output).toContain('15 completed');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should show no active swarm message', async () => { try {
      fs.pathExists.mockResolvedValue(false);

      await swarmCommand(['status'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No active swarm found'));
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('swarm stop', () => {
    jest.setTimeout(10000);
  test('should stop active swarm', async () => { try {
      const mockSwarmData = {
        id: 'swarm-123',
        status: 'active',
        agents: [{ id: 'agent-1' }, { id: 'agent-2' }],
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(mockSwarmData);
      fs.writeJson.mockResolvedValue(undefined);
      fs.remove.mockResolvedValue(undefined);

      await swarmCommand(['stop'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Swarm stopped successfully');
      expect(fs.remove).toHaveBeenCalledWith(
        path.join(process.cwd(), '.claude', 'swarm', 'swarm.json'),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle stop with force flag', async () => { try {
      fs.pathExists.mockResolvedValue(true);
      fs.remove.mockResolvedValue(undefined);

      await swarmCommand(['stop'], { force: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(fs.remove).toHaveBeenCalled();
      expect(mockSpinner.warn).toHaveBeenCalledWith('Swarm forcefully terminated');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('swarm pause/resume', () => {
    jest.setTimeout(10000);
  test('should pause active swarm', async () => { try {
      const mockSwarmData = {
        id: 'swarm-123',
        status: 'active',
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(mockSwarmData);
      fs.writeJson.mockResolvedValue(undefined);

      await swarmCommand(['pause'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const writeCall = fs.writeJson.mock.calls[0];
      expect(writeCall[1].status).toBe('paused');
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Swarm paused');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should resume paused swarm', async () => { try {
      const mockSwarmData = {
        id: 'swarm-123',
        status: 'paused',
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(mockSwarmData);
      fs.writeJson.mockResolvedValue(undefined);

      await swarmCommand(['resume'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const writeCall = fs.writeJson.mock.calls[0];
      expect(writeCall[1].status).toBe('active');
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Swarm resumed');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('swarm logs', () => {
    jest.setTimeout(10000);
  test('should display swarm logs', async () => { try {
      const mockLogs = [
        { timestamp: new Date().toISOString(), level: 'info', message: 'Swarm initialized' },
        { timestamp: new Date().toISOString(), level: 'info', message: 'Agent spawned' },
        { timestamp: new Date().toISOString(), level: 'error', message: 'Task failed' },
      ];

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue({ logs: mockLogs } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await swarmCommand(['logs'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Swarm Logs');
      expect(output).toContain('Swarm initialized');
      expect(output).toContain('Agent spawned');
      expect(output).toContain('Task failed');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should filter logs by level', async () => { try {
      const mockLogs = [
        { timestamp: new Date().toISOString(), level: 'info', message: 'Info message' },
        { timestamp: new Date().toISOString(), level: 'error', message: 'Error message' },
        { timestamp: new Date().toISOString(), level: 'debug', message: 'Debug message' },
      ];

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue({ logs: mockLogs } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await swarmCommand(['logs'], { level: 'error' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Error message');
      expect(output).not.toContain('Info message');
      expect(output).not.toContain('Debug message');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should tail logs', async () => { try {
      const mockLogs = Array.from({ length: 50 }, (_, i) => ({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Log entry ${i + 1}`,
      }));

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue({ logs: mockLogs } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await swarmCommand(['logs'], { tail: '10' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Log entry 50');
      expect(output).toContain('Log entry 41');
      expect(output).not.toContain('Log entry 40');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('error handling', () => {
    jest.setTimeout(10000);
  test('should handle missing objective', async () => { try {
      await swarmCommand([], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('objective is required'),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle invalid strategy', async () => { try {
      fs.ensureDir.mockResolvedValue(undefined);
      fs.writeJson.mockResolvedValue(undefined);

      await swarmCommand(['Task'], { strategy: 'invalid-strategy' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid strategy'));
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle spawn process errors', async () => { try {
      fs.ensureDir.mockResolvedValue(undefined);
      fs.writeJson.mockResolvedValue(undefined);

      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'error') callback(new Error('Spawn failed'));
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await swarmCommand(['Task'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(mockSpinner.fail).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize swarm'),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle file system errors', async () => { try {
      fs.ensureDir.mockRejectedValue(new Error('Permission denied'));

      await swarmCommand(['Task'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('help', () => {
    jest.setTimeout(10000);
  test('should show help for invalid subcommand', async () => { try {
      await swarmCommand(['invalid'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Swarm Orchestration');
      expect(output).toContain('USAGE:');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
