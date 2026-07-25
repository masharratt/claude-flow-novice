#!/usr/bin/env node
/**
 * Event Bus Wrapper - Standalone Implementation
 *
 * Provides a simple event bus without external dependencies
 */

const EventEmitter = require('events');

class SimpleEventBus extends EventEmitter {
    constructor() {
        super();
        this.eventCounts = new Map();
        this.lastEventTimes = new Map();
        this.setMaxListeners(100); // Prevent memory leak warnings
    }

    /**
     * Emit an event with tracking
     */
    emitEvent(topic, payload) {
        // Track event metrics
        const count = this.eventCounts.get(topic) || 0;
        this.eventCounts.set(topic, count + 1);
        this.lastEventTimes.set(topic, Date.now());

        // Emit the event
        this.emit(topic, payload);
    }

    /**
     * Get event statistics
     */
    getEventStats() {
        const stats = [];
        for (const [event, count] of this.eventCounts.entries()) {
            const lastTime = this.lastEventTimes.get(event);
            stats.push({
                event: String(event),
                count,
                lastEmitted: lastTime ? new Date(lastTime) : null
            });
        }
        return stats.sort((a, b) => b.count - a.count);
    }

    /**
     * Reset event statistics
     */
    resetStats() {
        this.eventCounts.clear();
        this.lastEventTimes.clear();
    }
}

// Singleton instance
let instance = null;

function getInstance() {
    if (!instance) {
        instance = new SimpleEventBus();
    }
    return instance;
}

module.exports = {
    eventBus: getInstance(),
    SimpleEventBus
};
