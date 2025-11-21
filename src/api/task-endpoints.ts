/**
 * Task Management API Endpoints
 *
 * RESTful API endpoints for managing CFN Loop tasks, including
 * creation, updates, status tracking, and lifecycle management.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// Types
export interface Task {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metadata: Record<string, any>;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  agents: Array<{
    id: string;
    type: string;
    status: string;
    confidence?: number;
  }>;
}

export interface CreateTaskRequest {
  name: string;
  description: string;
  priority?: Task['priority'];
  assignedTo?: string;
  metadata?: Record<string, any>;
}

export interface UpdateTaskRequest {
  name?: string;
  description?: string;
  status?: Task['status'];
  priority?: Task['priority'];
  assignedTo?: string;
  metadata?: Record<string, any>;
  progress?: {
    current: number;
    total: number;
  };
}

// Validation schemas
const createTaskSchema = z.object({
  name: z.string().min(1, 'Task name is required').max(200, 'Task name too long'),
  description: z.string().min(1, 'Task description is required').max(2000, 'Task description too long'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  assignedTo: z.string().optional(),
  metadata: z.record(z.any()).optional().default({}),
});

const updateTaskSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignedTo: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  progress: z.object({
    current: z.number().min(0),
    total: z.number().min(1),
  }).optional(),
});

const queryTaskSchema = z.object({
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignedTo: z.string().optional(),
  createdBy: z.string().optional(),
  limit: z.string().transform(Number).refine(n => n > 0 && n <= 100).optional().default('20'),
  offset: z.string().transform(Number).refine(n => n >= 0).optional().default('0'),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'status']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * Task Endpoints Class
 */
export class TaskEndpoints {
  private tasks: Map<string, Task> = new Map();

  constructor(private taskManager?: any) {
    // Initialize with some sample tasks for development
    this.initializeSampleTasks();
  }

  /**
   * Initialize sample tasks for development
   */
  private initializeSampleTasks(): void {
    const sampleTasks: Task[] = [
      {
        id: uuidv4(),
        name: 'Implement User Authentication',
        description: 'Add JWT-based authentication system with refresh tokens',
        status: 'running',
        priority: 'high',
        createdBy: 'system',
        createdAt: new Date(Date.now() - 3600000),
        updatedAt: new Date(),
        startedAt: new Date(Date.now() - 1800000),
        metadata: { phase: 'auth', epic: 'user-management' },
        progress: { current: 7, total: 10, percentage: 70 },
        agents: [
          { id: 'backend-dev-1', type: 'backend-developer', status: 'completed', confidence: 0.92 },
          { id: 'security-1', type: 'security-specialist', status: 'running', confidence: 0.88 },
        ],
      },
      {
        id: uuidv4(),
        name: 'Database Migration Script',
        description: 'Create migration script for new user roles table',
        status: 'completed',
        priority: 'medium',
        createdBy: 'admin',
        createdAt: new Date(Date.now() - 7200000),
        updatedAt: new Date(Date.now() - 600000),
        startedAt: new Date(Date.now() - 3600000),
        completedAt: new Date(Date.now() - 600000),
        metadata: { phase: 'database', migration: '003_add_user_roles' },
        progress: { current: 5, total: 5, percentage: 100 },
        agents: [
          { id: 'backend-dev-2', type: 'backend-developer', status: 'completed', confidence: 0.95 },
        ],
      },
    ];

    sampleTasks.forEach(task => this.tasks.set(task.id, task));
  }

  /**
   * Get Express router with all task endpoints
   */
  public getRouter(): Router {
    const router = Router();

    // GET /tasks - List tasks with filtering
    router.get('/', this.handleGetTasks.bind(this));

    // GET /tasks/:id - Get specific task
    router.get('/:id', this.handleGetTask.bind(this));

    // POST /tasks - Create new task
    router.post('/', this.handleCreateTask.bind(this));

    // PUT /tasks/:id - Update task
    router.put('/:id', this.handleUpdateTask.bind(this));

    // PATCH /tasks/:id/status - Update task status
    router.patch('/:id/status', this.handleUpdateTaskStatus.bind(this));

    // DELETE /tasks/:id - Delete task
    router.delete('/:id', this.handleDeleteTask.bind(this));

    // POST /tasks/:id/agents - Add agent to task
    router.post('/:id/agents', this.handleAddAgentToTask.bind(this));

    // GET /tasks/:id/agents - Get task agents
    router.get('/:id/agents', this.handleGetTaskAgents.bind(this));

    // POST /tasks/:id/cancel - Cancel task
    router.post('/:id/cancel', this.handleCancelTask.bind(this));

    return router;
  }

  /**
   * GET /tasks - List tasks with filtering and pagination
   */
  private async handleGetTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = queryTaskSchema.parse(req.query);
      
      let tasks = Array.from(this.tasks.values());

      // Apply filters
      if (query.status) {
        tasks = tasks.filter(task => task.status === query.status);
      }
      if (query.priority) {
        tasks = tasks.filter(task => task.priority === query.priority);
      }
      if (query.assignedTo) {
        tasks = tasks.filter(task => task.assignedTo === query.assignedTo);
      }
      if (query.createdBy) {
        tasks = tasks.filter(task => task.createdBy === query.createdBy);
      }

      // Sort tasks
      tasks.sort((a, b) => {
        const aValue = a[query.sortBy as keyof Task];
        const bValue = b[query.sortBy as keyof Task];
        
        if (aValue instanceof Date && bValue instanceof Date) {
          return query.sortOrder === 'asc' 
            ? aValue.getTime() - bValue.getTime()
            : bValue.getTime() - aValue.getTime();
        }
        
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return query.sortOrder === 'asc' 
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }
        
        return 0;
      });

      // Apply pagination
      const total = tasks.length;
      const paginatedTasks = tasks.slice(query.offset, query.offset + query.limit);

      res.json({
        tasks: paginatedTasks,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + query.limit < total,
        },
        filters: {
          status: query.status,
          priority: query.priority,
          assignedTo: query.assignedTo,
          createdBy: query.createdBy,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /tasks/:id - Get specific task
   */
  private async handleGetTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const task = this.tasks.get(id);

      if (!task) {
        res.status(404).json({
          error: 'Not Found',
          message: `Task with ID ${id} not found`,
        });
        return;
      }

      res.json({ task });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /tasks - Create new task
   */
  private async handleCreateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = createTaskSchema.parse(req.body);
      const createdBy = (req as any).user?.id || 'anonymous';

      const task: Task = {
        id: uuidv4(),
        name: validatedData.name,
        description: validatedData.description,
        status: 'pending',
        priority: validatedData.priority,
        assignedTo: validatedData.assignedTo,
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: validatedData.metadata,
        progress: { current: 0, total: 1, percentage: 0 },
        agents: [],
      };

      this.tasks.set(task.id, task);

      // Notify task manager if available
      if (this.taskManager) {
        await this.taskManager.createTask(task);
      }

      res.status(201).json({
        message: 'Task created successfully',
        task,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /tasks/:id - Update task
   */
  private async handleUpdateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const validatedData = updateTaskSchema.parse(req.body);

      const task = this.tasks.get(id);
      if (!task) {
        res.status(404).json({
          error: 'Not Found',
          message: `Task with ID ${id} not found`,
        });
        return;
      }

      // Update task fields
      const updatedTask = {
        ...task,
        ...validatedData,
        updatedAt: new Date(),
      };

      // Update progress percentage if progress data provided
      if (validatedData.progress) {
        updatedTask.progress = {
          ...validatedData.progress,
          percentage: Math.round((validatedData.progress.current / validatedData.progress.total) * 100),
        };
      }

      // Handle status transitions
      if (validatedData.status) {
        if (validatedData.status === 'running' && task.status !== 'running') {
          updatedTask.startedAt = new Date();
        } else if (['completed', 'failed', 'cancelled'].includes(validatedData.status) && 
                   !['completed', 'failed', 'cancelled'].includes(task.status)) {
          updatedTask.completedAt = new Date();
          updatedTask.progress.percentage = 100;
        }
      }

      this.tasks.set(id, updatedTask);

      // Notify task manager if available
      if (this.taskManager) {
        await this.taskManager.updateTask(updatedTask);
      }

      res.json({
        message: 'Task updated successfully',
        task: updatedTask,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /tasks/:id/status - Update task status
   */
  private async handleUpdateTaskStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['pending', 'running', 'completed', 'failed', 'cancelled'].includes(status)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid status value',
        });
        return;
      }

      const task = this.tasks.get(id);
      if (!task) {
        res.status(404).json({
          error: 'Not Found',
          message: `Task with ID ${id} not found`,
        });
        return;
      }

      const updatedTask = {
        ...task,
        status,
        updatedAt: new Date(),
      };

      // Handle status transitions
      if (status === 'running' && task.status !== 'running') {
        updatedTask.startedAt = new Date();
      } else if (['completed', 'failed', 'cancelled'].includes(status) && 
                 !['completed', 'failed', 'cancelled'].includes(task.status)) {
        updatedTask.completedAt = new Date();
        updatedTask.progress.percentage = 100;
      }

      this.tasks.set(id, updatedTask);

      // Notify task manager if available
      if (this.taskManager) {
        await this.taskManager.updateTaskStatus(id, status);
      }

      res.json({
        message: 'Task status updated successfully',
        task: updatedTask,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /tasks/:id - Delete task
   */
  private async handleDeleteTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const task = this.tasks.get(id);

      if (!task) {
        res.status(404).json({
          error: 'Not Found',
          message: `Task with ID ${id} not found`,
        });
        return;
      }

      // Don't allow deletion of running tasks
      if (task.status === 'running') {
        res.status(409).json({
          error: 'Conflict',
          message: 'Cannot delete a running task. Cancel it first.',
        });
        return;
      }

      this.tasks.delete(id);

      // Notify task manager if available
      if (this.taskManager) {
        await this.taskManager.deleteTask(id);
      }

      res.json({
        message: 'Task deleted successfully',
        taskId: id,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /tasks/:id/agents - Add agent to task
   */
  private async handleAddAgentToTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { agentId, agentType, status = 'assigned', confidence } = req.body;

      if (!agentId || !agentType) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'agentId and agentType are required',
        });
        return;
      }

      const task = this.tasks.get(id);
      if (!task) {
        res.status(404).json({
          error: 'Not Found',
          message: `Task with ID ${id} not found`,
        });
        return;
      }

      // Check if agent already exists
      const existingAgent = task.agents.find(agent => agent.id === agentId);
      if (existingAgent) {
        res.status(409).json({
          error: 'Conflict',
          message: 'Agent already assigned to this task',
        });
        return;
      }

      const newAgent = {
        id: agentId,
        type: agentType,
        status,
        confidence,
      };

      task.agents.push(newAgent);
      task.updatedAt = new Date();

      this.tasks.set(id, task);

      res.status(201).json({
        message: 'Agent added to task successfully',
        agent: newAgent,
        task,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /tasks/:id/agents - Get task agents
   */
  private async handleGetTaskAgents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const task = this.tasks.get(id);

      if (!task) {
        res.status(404).json({
          error: 'Not Found',
          message: `Task with ID ${id} not found`,
        });
        return;
      }

      res.json({
        taskId: id,
        agents: task.agents,
        totalAgents: task.agents.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /tasks/:id/cancel - Cancel task
   */
  private async handleCancelTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const task = this.tasks.get(id);

      if (!task) {
        res.status(404).json({
          error: 'Not Found',
          message: `Task with ID ${id} not found`,
        });
        return;
      }

      if (task.status === 'completed') {
        res.status(409).json({
          error: 'Conflict',
          message: 'Cannot cancel a completed task',
        });
        return;
      }

      if (task.status === 'cancelled') {
        res.status(409).json({
          error: 'Conflict',
          message: 'Task is already cancelled',
        });
        return;
      }

      const updatedTask = {
        ...task,
        status: 'cancelled' as const,
        updatedAt: new Date(),
        completedAt: new Date(),
      };

      this.tasks.set(id, updatedTask);

      // Notify task manager if available
      if (this.taskManager) {
        await this.taskManager.cancelTask(id);
      }

      res.json({
        message: 'Task cancelled successfully',
        task: updatedTask,
      });
    } catch (error) {
      next(error);
    }
  }
}

/**
 * Factory function to create task endpoints
 */
export function createTaskEndpoints(taskManager?: any): TaskEndpoints {
  return new TaskEndpoints(taskManager);
}