/**
 * Hierarchy API Routes
 *
 * REST API endpoints for agent hierarchy management and visualization
 *
 * @module web/api/routes/hierarchy
 */

import { Router, Request, Response } from 'express';
import type { ITransparencySystem } from '../../coordination/shared/transparency/interfaces/transparency-system.js';
import type { AgentHierarchyNode } from '../../coordination/shared/transparency/interfaces/transparency-system.js';
import type { Logger } from '../../../core/logger.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validationMiddleware, commonSchemas } from '../middleware/validation.js';

/**
 * Create hierarchy routes
 */
export function hierarchyRoutes(
  transparencySystem: ITransparencySystem,
  logger: Logger
): Router {
  const router = Router();

  /**
   * GET /api/v1/hierarchy
   * Get complete agent hierarchy tree
   */
  router.get('/',
    asyncHandler(async (req: Request, res: Response) => {
      logger.info('Getting complete agent hierarchy');

      const hierarchy = await transparencySystem.getAgentHierarchy();

      res.json({
        data: hierarchy,
        meta: {
          totalAgents: hierarchy.length,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/hierarchy/level/:level
   * Get agents at specific hierarchy level
   */
  router.get('/level/:level',
    validationMiddleware({
      params: commonSchemas.levelFilter
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const level = parseInt(req.params.level, 10);
      logger.info(`Getting agents at level ${level}`);

      const agents = await transparencySystem.getAgentsAtLevel(level);

      res.json({
        data: agents,
        meta: {
          level,
          count: agents.length,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/hierarchy/root
   * Get root agents (level 1, no parent)
   */
  router.get('/root',
    asyncHandler(async (req: Request, res: Response) => {
      logger.info('Getting root agents');

      const rootAgents = await transparencySystem.getRootAgents();

      res.json({
        data: rootAgents,
        meta: {
          count: rootAgents.length,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/hierarchy/parent/:parentAgentId
   * Get child agents of specified parent
   */
  router.get('/parent/:parentAgentId',
    validationMiddleware({
      params: commonSchemas.agentIdParam
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { parentAgentId } = req.params;
      logger.info(`Getting child agents of parent ${parentAgentId}`);

      const childAgents = await transparencySystem.getChildAgents(parentAgentId);

      res.json({
        data: childAgents,
        meta: {
          parentAgentId,
          count: childAgents.length,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/hierarchy/agent/:agentId
   * Get specific agent hierarchy information
   */
  router.get('/agent/:agentId',
    validationMiddleware({
      params: commonSchemas.agentIdParam
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { agentId } = req.params;
      logger.info(`Getting hierarchy info for agent ${agentId}`);

      const hierarchy = await transparencySystem.getAgentHierarchy();
      const agentInfo = hierarchy.find(agent => agent.agentId === agentId);

      if (!agentInfo) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: `Agent ${agentId} not found in hierarchy`,
          timestamp: new Date().toISOString()
        });
      }

      // Get child agents if any
      const childAgents = await transparencySystem.getChildAgents(agentId);

      res.json({
        data: {
          ...agentInfo,
          childAgents
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/hierarchy/tree
   * Get hierarchy as a tree structure (nested)
   */
  router.get('/tree',
    asyncHandler(async (req: Request, res: Response) => {
      logger.info('Getting hierarchy as tree structure');

      const hierarchy = await transparencySystem.getAgentHierarchy();
      const tree = buildHierarchyTree(hierarchy);

      res.json({
        data: tree,
        meta: {
          totalAgents: hierarchy.length,
          treeDepth: calculateTreeDepth(tree),
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/hierarchy/stats
   * Get hierarchy statistics
   */
  router.get('/stats',
    asyncHandler(async (req: Request, res: Response) => {
      logger.info('Getting hierarchy statistics');

      const hierarchy = await transparencySystem.getAgentHierarchy();
      const stats = calculateHierarchyStats(hierarchy);

      res.json({
        data: stats,
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/hierarchy/search
   * Search agents in hierarchy
   */
  router.get('/search',
    validationMiddleware({
      query: {
        type: 'object',
        properties: {
          q: {
            type: 'string',
            minLength: 1,
            description: 'Search query'
          },
          type: {
            type: 'string',
            description: 'Agent type filter'
          },
          state: {
            type: 'string',
            enum: [
              'idle',
              'active',
              'paused',
              'terminated',
              'error',
              'completing',
              'checkpointing',
              'waiting_for_dependency'
            ],
            description: 'Agent state filter'
          },
          level: {
            type: 'integer',
            minimum: 1,
            description: 'Hierarchy level filter'
          }
        },
        required: ['q']
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { q, type, state, level } = req.query as any;
      logger.info(`Searching hierarchy with query: ${q}`);

      const hierarchy = await transparencySystem.getAgentHierarchy();
      const results = searchHierarchy(hierarchy, {
        query: q,
        type,
        state,
        level: level ? parseInt(level, 10) : undefined
      });

      res.json({
        data: results,
        meta: {
          query: { q, type, state, level },
          count: results.length,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  return router;
}

/**
 * Build hierarchical tree structure from flat agent list
 */
function buildHierarchyTree(agents: AgentHierarchyNode[]): any[] {
  const agentMap = new Map<string, AgentHierarchyNode & { children: any[] }>();

  // Create map of all agents with empty children arrays
  agents.forEach(agent => {
    agentMap.set(agent.agentId, { ...agent, children: [] });
  });

  // Build tree structure
  const roots: any[] = [];

  agentMap.forEach(agent => {
    if (agent.parentAgentId && agentMap.has(agent.parentAgentId)) {
      // Add to parent's children
      const parent = agentMap.get(agent.parentAgentId)!;
      parent.children.push(agent);
    } else {
      // This is a root agent
      roots.push(agent);
    }
  });

  return roots;
}

/**
 * Calculate tree depth
 */
function calculateTreeDepth(tree: any[]): number {
  if (!tree || tree.length === 0) return 0;

  let maxDepth = 0;

  function calculateDepth(node: any, currentDepth: number): void {
    maxDepth = Math.max(maxDepth, currentDepth);

    if (node.children && node.children.length > 0) {
      node.children.forEach((child: any) => calculateDepth(child, currentDepth + 1));
    }
  }

  tree.forEach(node => calculateDepth(node, 1));

  return maxDepth;
}

/**
 * Calculate hierarchy statistics
 */
function calculateHierarchyStats(agents: AgentHierarchyNode[]): any {
  const stats = {
    totalAgents: agents.length,
    agentsByLevel: {} as Record<number, number>,
    agentsByType: {} as Record<string, number>,
    agentsByState: {} as Record<string, number>,
    averageTokensUsed: 0,
    totalTokensUsed: 0,
    totalTokenBudget: 0,
    parentAgents: 0,
    leafAgents: 0,
    maxChildrenPerParent: 0,
    averageChildrenPerParent: 0
  };

  let totalChildren = 0;
  let parentCount = 0;

  agents.forEach(agent => {
    // Count by level
    stats.agentsByLevel[agent.level] = (stats.agentsByLevel[agent.level] || 0) + 1;

    // Count by type
    stats.agentsByType[agent.type] = (stats.agentsByType[agent.type] || 0) + 1;

    // Count by state
    stats.agentsByState[agent.state] = (stats.agentsByState[agent.state] || 0) + 1;

    // Token metrics
    stats.totalTokensUsed += agent.tokensUsed;
    stats.totalTokenBudget += agent.tokenBudget;

    // Parent/leaf metrics
    if (agent.childAgentIds.length > 0) {
      parentCount++;
      totalChildren += agent.childAgentIds.length;
      stats.maxChildrenPerParent = Math.max(stats.maxChildrenPerParent, agent.childAgentIds.length);
    } else {
      stats.leafAgents++;
    }
  });

  stats.averageTokensUsed = agents.length > 0 ? stats.totalTokensUsed / agents.length : 0;
  stats.averageChildrenPerParent = parentCount > 0 ? totalChildren / parentCount : 0;
  stats.parentAgents = parentCount;

  return stats;
}

/**
 * Search hierarchy with filters
 */
function searchHierarchy(
  agents: AgentHierarchyNode[],
  filters: {
    query: string;
    type?: string;
    state?: string;
    level?: number;
  }
): AgentHierarchyNode[] {
  const query = filters.query.toLowerCase();

  return agents.filter(agent => {
    // Text search in agent ID, type, current task, and metadata
    const textMatch =
      agent.agentId.toLowerCase().includes(query) ||
      agent.type.toLowerCase().includes(query) ||
      (agent.currentTask && agent.currentTask.toLowerCase().includes(query)) ||
      JSON.stringify(agent.metadata).toLowerCase().includes(query);

    if (!textMatch) return false;

    // Type filter
    if (filters.type && agent.type !== filters.type) return false;

    // State filter
    if (filters.state && agent.state !== filters.state) return false;

    // Level filter
    if (filters.level !== undefined && agent.level !== filters.level) return false;

    return true;
  });
}