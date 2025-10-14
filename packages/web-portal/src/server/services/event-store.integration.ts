/**
 * Event Store Service Integration Layer
 * 
 * Provides integration points for the EventStoreService with other system components
 * Includes Express route handlers, WebSocket adapters, and middleware
 */

import { Request, Response } from 'express';
import { eventStoreService } from './event-store.js';
import type { EventData, EventQueryFilters } from './event-store.js';

/**
 * Express Route Handlers for Event Store API
 */
export class EventStoreController {
  /**
   * Store a single event
   * POST /api/events
   */
  static async storeEvent(req: Request, res: Response): Promise<void> {
    try {
      const { timestamp, phaseId, agentId, eventType, payload, metadata } = req.body;
      
      // Validate required fields
      if (!phaseId || !agentId || !eventType || !payload) {
        res.status(400).json({
          error: 'Missing required fields: phaseId, agentId, eventType, payload'
        });
        return;
      }
      
      const eventData = {
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        phaseId,
        agentId,
        eventType,
        payload,
        metadata
      };
      
      const eventId = await eventStoreService.storeEvent(eventData);
      
      res.status(201).json({
        success: true,
        eventId,
        message: 'Event stored successfully'
      });
    } catch (error) {
      console.error('Failed to store event:', error);
      res.status(500).json({
        error: 'Failed to store event',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Store multiple events in batch
   * POST /api/events/batch
   */
  static async storeEvents(req: Request, res: Response): Promise<void> {
    try {
      const { events } = req.body;
      
      if (!Array.isArray(events) || events.length === 0) {
        res.status(400).json({
          error: 'Events array is required and must not be empty'
        });
        return;
      }
      
      // Validate each event
      for (const event of events) {
        if (!event.phaseId || !event.agentId || !event.eventType || !event.payload) {
          res.status(400).json({
            error: 'Each event must have: phaseId, agentId, eventType, payload'
          });
          return;
        }
      }
      
      // Process events
      const processedEvents = events.map(event => ({
        timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
        phaseId: event.phaseId,
        agentId: event.agentId,
        eventType: event.eventType,
        payload: event.payload,
        metadata: event.metadata
      }));
      
      const eventIds = await eventStoreService.storeEvents(processedEvents);
      
      res.status(201).json({
        success: true,
        eventIds,
        count: eventIds.length,
        message: `${eventIds.length} events stored successfully`
      });
    } catch (error) {
      console.error('Failed to store events:', error);
      res.status(500).json({
        error: 'Failed to store events',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Query events with filters
   * GET /api/events
   */
  static async queryEvents(req: Request, res: Response): Promise<void> {
    try {
      const filters: EventQueryFilters = {};
      
      // Parse query parameters
      if (req.query.phaseId) filters.phaseId = req.query.phaseId as string;
      if (req.query.agentId) filters.agentId = req.query.agentId as string;
      if (req.query.eventType) filters.eventType = req.query.eventType as string;
      if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);
      if (req.query.limit) filters.limit = parseInt(req.query.limit as string, 10);
      if (req.query.offset) filters.offset = parseInt(req.query.offset as string, 10);
      
      // Validate parameters
      if (filters.limit && (filters.limit < 1 || filters.limit > 1000)) {
        res.status(400).json({ error: 'Limit must be between 1 and 1000' });
        return;
      }
      
      if (filters.offset && filters.offset < 0) {
        res.status(400).json({ error: 'Offset must be non-negative' });
        return;
      }
      
      if (filters.startDate && isNaN(filters.startDate.getTime())) {
        res.status(400).json({ error: 'Invalid startDate format' });
        return;
      }
      
      if (filters.endDate && isNaN(filters.endDate.getTime())) {
        res.status(400).json({ error: 'Invalid endDate format' });
        return;
      }
      
      const result = await eventStoreService.queryEvents(filters);
      
      res.json({
        success: true,
        data: result.events,
        pagination: {
          total: result.total,
          limit: filters.limit || 100,
          offset: filters.offset || 0,
          hasMore: result.hasMore
        }
      });
    } catch (error) {
      console.error('Failed to query events:', error);
      res.status(500).json({
        error: 'Failed to query events',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Get events by phase ID
   * GET /api/events/phase/:phaseId
   */
  static async getEventsByPhase(req: Request, res: Response): Promise<void> {
    try {
      const { phaseId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      
      if (!phaseId) {
        res.status(400).json({ error: 'Phase ID is required' });
        return;
      }
      
      const events = await eventStoreService.getEventsByPhaseId(phaseId, limit);
      
      res.json({
        success: true,
        data: events,
        count: events.length
      });
    } catch (error) {
      console.error('Failed to get events by phase:', error);
      res.status(500).json({
        error: 'Failed to get events by phase',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Get events by agent ID
   * GET /api/events/agent/:agentId
   */
  static async getEventsByAgent(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      
      if (!agentId) {
        res.status(400).json({ error: 'Agent ID is required' });
        return;
      }
      
      const events = await eventStoreService.getEventsByAgentId(agentId, limit);
      
      res.json({
        success: true,
        data: events,
        count: events.length
      });
    } catch (error) {
      console.error('Failed to get events by agent:', error);
      res.status(500).json({
        error: 'Failed to get events by agent',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Get event store statistics
   * GET /api/events/stats
   */
  static async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = await eventStoreService.getStatistics();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Failed to get statistics:', error);
      res.status(500).json({
        error: 'Failed to get statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Delete an event
   * DELETE /api/events/:eventId
   */
  static async deleteEvent(req: Request, res: Response): Promise<void> {
    try {
      const { eventId } = req.params;
      
      if (!eventId) {
        res.status(400).json({ error: 'Event ID is required' });
        return;
      }
      
      const deleted = await eventStoreService.deleteEvent(eventId);
      
      if (deleted) {
        res.json({
          success: true,
          message: 'Event deleted successfully'
        });
      } else {
        res.status(404).json({
          error: 'Event not found'
        });
      }
    } catch (error) {
      console.error('Failed to delete event:', error);
      res.status(500).json({
        error: 'Failed to delete event',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

/**
 * CFN Loop Specific Integration
 */
export class CFNLoopEventAdapter {
  /**
   * Store CFN loop event with standardized format
   */
  static async storeCFNLoopEvent(params: {
    phaseId: string;
    agentId: string;
    loopNumber: number;
    loopType: 'implementation' | 'validation' | 'coordination';
    eventType: string;
    payload: any;
    confidence?: number;
    duration?: number;
  }): Promise<string> {
    const eventData = {
      timestamp: new Date(),
      phaseId: params.phaseId,
      agentId: params.agentId,
      eventType: `cfn_${params.loopType}_${params.eventType}`,
      payload: {
        loopNumber: params.loopNumber,
        loopType: params.loopType,
        ...params.payload,
        confidence: params.confidence,
        duration: params.duration
      },
      metadata: {
        source: 'cfn-loop',
        version: '3.0.0'
      }
    };
    
    return await eventStoreService.storeEvent(eventData);
  }
  
  /**
   * Get CFN loop events for a specific phase
   */
  static async getCFNLoopEvents(phaseId: string, loopType?: string): Promise<EventData[]> {
    const filters: EventQueryFilters = {
      phaseId,
      limit: 1000
    };
    
    if (loopType) {
      filters.eventType = `cfn_${loopType}`;
    }
    
    const result = await eventStoreService.queryEvents(filters);
    return result.events;
  }
  
  /**
   * Get CFN loop completion status
   */
  static async getCFNLoopStatus(phaseId: string): Promise<{
    totalEvents: number;
    implementationEvents: number;
    validationEvents: number;
    coordinationEvents: number;
    lastEvent?: EventData;
  }> {
    const allEvents = await this.getCFNLoopEvents(phaseId);
    
    const implementationEvents = allEvents.filter(e => e.eventType.startsWith('cfn_implementation_'));
    const validationEvents = allEvents.filter(e => e.eventType.startsWith('cfn_validation_'));
    const coordinationEvents = allEvents.filter(e => e.eventType.startsWith('cfn_coordination_'));
    
    // Sort by timestamp to get last event
    const sortedEvents = allEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const lastEvent = sortedEvents[0];
    
    return {
      totalEvents: allEvents.length,
      implementationEvents: implementationEvents.length,
      validationEvents: validationEvents.length,
      coordinationEvents: coordinationEvents.length,
      lastEvent
    };
  }
}

/**
 * WebSocket Event Streaming Adapter
 */
export class EventStoreWebSocketAdapter {
  private subscribers: Map<string, (event: EventData) => void> = new Map();
  
  /**
   * Subscribe to events for a specific phase
   */
  subscribeToPhaseEvents(phaseId: string, callback: (event: EventData) => void): () => void {
    const key = `phase:${phaseId}`;
    this.subscribers.set(key, callback);
    
    return () => {
      this.subscribers.delete(key);
    };
  }
  
  /**
   * Subscribe to events for a specific agent
   */
  subscribeToAgentEvents(agentId: string, callback: (event: EventData) => void): () => void {
    const key = `agent:${agentId}`;
    this.subscribers.set(key, callback);
    
    return () => {
      this.subscribers.delete(key);
    };
  }
  
  /**
   * Notify subscribers of new event
   */
  private notifySubscribers(event: EventData): void {
    // Notify phase subscribers
    const phaseKey = `phase:${event.phaseId}`;
    const phaseCallback = this.subscribers.get(phaseKey);
    if (phaseCallback) {
      phaseCallback(event);
    }
    
    // Notify agent subscribers
    const agentKey = `agent:${event.agentId}`;
    const agentCallback = this.subscribers.get(agentKey);
    if (agentCallback) {
      agentCallback(event);
    }
  }
  
  /**
   * Store event and notify subscribers
   */
  async storeAndNotify(event: Omit<EventData, 'id'>): Promise<string> {
    const eventId = await eventStoreService.storeEvent(event);
    
    // Notify subscribers
    this.notifySubscribers({
      ...event,
      id: eventId
    });
    
    return eventId;
  }
}

/**
 * Export singleton instances
 */
export const eventStoreController = EventStoreController;
export const cfnLoopAdapter = CFNLoopEventAdapter;
export const webSocketAdapter = new EventStoreWebSocketAdapter();