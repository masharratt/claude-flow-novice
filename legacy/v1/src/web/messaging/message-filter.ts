/**
 * Message Filter - Advanced filtering and search for agent messages
 */

export interface FilterConfig {
  messageTypes?: string[];
  agentTypes?: ('researcher' | 'coder' | 'reviewer')[];
  agentIds?: string[];
  priorities?: ('low' | 'medium' | 'high' | 'urgent')[];
  timeRange?: {
    start: string;
    end: string;
  };
  contentKeywords?: string[];
  hasReasoning?: boolean;
  hasAlternatives?: boolean;
  confidenceRange?: {
    min: number;
    max: number;
  };
  threadIds?: string[];
  tags?: string[];
}

export class MessageFilter {
  private userFilters = new Map<string, FilterConfig>();

  /**
   * Set filter configuration for a specific user/client
   */
  public setUserFilter(userId: string, config: FilterConfig): void {
    this.userFilters.set(userId, config);
  }

  /**
   * Remove filter for a user/client
   */
  public removeUserFilter(userId: string): void {
    this.userFilters.delete(userId);
  }

  /**
   * Filter a message based on user preferences
   */
  public filterMessage(message: any, userId?: string): any {
    if (!userId) return message;

    const filter = this.userFilters.get(userId);
    if (!filter) return message;

    if (!this.messagePassesFilter(message, filter)) {
      return null; // Message filtered out
    }

    return message;
  }

  /**
   * Filter an array of messages
   */
  public filterMessages(messages: any[], filter: FilterConfig): any[] {
    return messages.filter((message) => this.messagePassesFilter(message, filter));
  }

  /**
   * Search messages with advanced criteria
   */
  public searchMessages(
    messages: any[],
    searchConfig: {
      query?: string;
      fuzzy?: boolean;
      fields?: string[];
      sortBy?: 'timestamp' | 'relevance' | 'priority';
      sortOrder?: 'asc' | 'desc';
    },
  ): any[] {
    let results = [...messages];

    // Apply text search
    if (searchConfig.query) {
      results = this.performTextSearch(results, searchConfig.query, searchConfig);
    }

    // Sort results
    if (searchConfig.sortBy) {
      results = this.sortMessages(results, searchConfig.sortBy, searchConfig.sortOrder || 'desc');
    }

    return results;
  }

  /**
   * Get filter suggestions based on available data
   */
  public getFilterSuggestions(messages: any[]): {
    messageTypes: string[];
    agentTypes: string[];
    agentIds: string[];
    priorities: string[];
    tags: string[];
    dateRange: { start: string; end: string };
  } {
    const messageTypes = [...new Set(messages.map((m) => m.messageType))];
    const agentTypes = [...new Set(messages.map((m) => m.agentType))];
    const agentIds = [...new Set(messages.map((m) => m.agentId))];
    const priorities = [...new Set(messages.map((m) => m.priority))];

    // Extract tags from metadata
    const tags = [...new Set(messages.flatMap((m) => m.metadata?.tags || []).filter(Boolean))];

    // Get date range
    const timestamps = messages.map((m) => new Date(m.timestamp).getTime());
    const dateRange = {
      start: new Date(Math.min(...timestamps)).toISOString(),
      end: new Date(Math.max(...timestamps)).toISOString(),
    };

    return {
      messageTypes,
      agentTypes,
      agentIds,
      priorities,
      tags,
      dateRange,
    };
  }

  /**
   * Create smart filters based on user behavior
   */
  public createSmartFilter(userId: string, interactionHistory: any[]): FilterConfig {
    const smartFilter: FilterConfig = {};

    // Analyze user's viewing patterns
    const viewedMessageTypes = interactionHistory
      .filter((h) => h.action === 'view')
      .map((h) => h.messageType);

    if (viewedMessageTypes.length > 0) {
      const mostViewedTypes = this.getMostFrequent(viewedMessageTypes, 3);
      smartFilter.messageTypes = mostViewedTypes;
    }

    // Analyze searched keywords
    const searchQueries = interactionHistory
      .filter((h) => h.action === 'search')
      .map((h) => h.query);

    if (searchQueries.length > 0) {
      smartFilter.contentKeywords = this.extractKeywords(searchQueries);
    }

    // Analyze time preferences
    const viewTimes = interactionHistory
      .filter((h) => h.action === 'view')
      .map((h) => new Date(h.timestamp).getHours());

    // If user typically views recent messages, prefer recent timeRange
    const averageHour = viewTimes.reduce((sum, hour) => sum + hour, 0) / viewTimes.length;
    if (averageHour > 0) {
      smartFilter.timeRange = {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
      };
    }

    return smartFilter;
  }

  private messagePassesFilter(message: any, filter: FilterConfig): boolean {
    // Message type filter
    if (filter.messageTypes && !filter.messageTypes.includes(message.messageType)) {
      return false;
    }

    // Agent type filter
    if (filter.agentTypes && !filter.agentTypes.includes(message.agentType)) {
      return false;
    }

    // Agent ID filter
    if (filter.agentIds && !filter.agentIds.includes(message.agentId)) {
      return false;
    }

    // Priority filter
    if (filter.priorities && !filter.priorities.includes(message.priority)) {
      return false;
    }

    // Time range filter
    if (filter.timeRange) {
      const messageTime = new Date(message.timestamp);
      const start = new Date(filter.timeRange.start);
      const end = new Date(filter.timeRange.end);

      if (messageTime < start || messageTime > end) {
        return false;
      }
    }

    // Content keywords filter
    if (filter.contentKeywords && filter.contentKeywords.length > 0) {
      const content = message.content.toLowerCase();
      const hasKeyword = filter.contentKeywords.some((keyword) =>
        content.includes(keyword.toLowerCase()),
      );
      if (!hasKeyword) return false;
    }

    // Reasoning filter
    if (filter.hasReasoning !== undefined) {
      const hasReasoning = !!message.metadata?.reasoning;
      if (filter.hasReasoning !== hasReasoning) return false;
    }

    // Alternatives filter
    if (filter.hasAlternatives !== undefined) {
      const hasAlternatives = !!(
        message.metadata?.alternatives && message.metadata.alternatives.length > 0
      );
      if (filter.hasAlternatives !== hasAlternatives) return false;
    }

    // Confidence range filter
    if (filter.confidenceRange && message.metadata?.confidence !== undefined) {
      const confidence = message.metadata.confidence;
      if (confidence < filter.confidenceRange.min || confidence > filter.confidenceRange.max) {
        return false;
      }
    }

    // Thread ID filter
    if (filter.threadIds && (!message.threadId || !filter.threadIds.includes(message.threadId))) {
      return false;
    }

    // Tags filter
    if (filter.tags && filter.tags.length > 0) {
      const messageTags = message.metadata?.tags || [];
      const hasTag = filter.tags.some((tag) => messageTags.includes(tag));
      if (!hasTag) return false;
    }

    return true;
  }

  private performTextSearch(messages: any[], query: string, config: any): any[] {
    const searchFields = config.fields || ['content', 'metadata.reasoning'];
    const fuzzy = config.fuzzy || false;

    return messages.filter((message) => {
      for (const field of searchFields) {
        const value = this.getNestedProperty(message, field);
        if (value && this.matchesQuery(value, query, fuzzy)) {
          return true;
        }
      }
      return false;
    });
  }

  private matchesQuery(text: string, query: string, fuzzy: boolean): boolean {
    const normalizedText = text.toLowerCase();
    const normalizedQuery = query.toLowerCase();

    if (!fuzzy) {
      return normalizedText.includes(normalizedQuery);
    }

    // Simple fuzzy matching - check if most query words are present
    const queryWords = normalizedQuery.split(' ');
    const matchedWords = queryWords.filter((word) => normalizedText.includes(word));

    return matchedWords.length / queryWords.length >= 0.6; // 60% word match threshold
  }

  private sortMessages(messages: any[], sortBy: string, order: string): any[] {
    return messages.sort((a, b) => {
      let compareValue = 0;

      switch (sortBy) {
        case 'timestamp':
          compareValue = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case 'priority':
          const priorityOrder = { low: 1, medium: 2, high: 3, urgent: 4 };
          compareValue =
            priorityOrder[a.priority as keyof typeof priorityOrder] -
            priorityOrder[b.priority as keyof typeof priorityOrder];
          break;
        case 'relevance':
          // Simple relevance based on message metadata richness
          const aScore = this.calculateRelevanceScore(a);
          const bScore = this.calculateRelevanceScore(b);
          compareValue = aScore - bScore;
          break;
      }

      return order === 'asc' ? compareValue : -compareValue;
    });
  }

  private calculateRelevanceScore(message: any): number {
    let score = 0;

    // Score based on metadata richness
    if (message.metadata?.reasoning) score += 3;
    if (message.metadata?.alternatives) score += 2;
    if (message.metadata?.confidence) score += 1;
    if (message.metadata?.dependencies) score += 1;
    if (message.metadata?.tags) score += message.metadata.tags.length * 0.5;

    // Score based on message type importance
    const typeScores = {
      decision: 5,
      coordination: 4,
      reasoning: 3,
      'progress-update': 2,
      'task-start': 2,
      completion: 1,
      error: 4,
    };

    score += typeScores[message.messageType as keyof typeof typeScores] || 1;

    return score;
  }

  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  private getMostFrequent<T>(array: T[], count: number): T[] {
    const frequency = new Map<T, number>();

    for (const item of array) {
      frequency.set(item, (frequency.get(item) || 0) + 1);
    }

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map((entry) => entry[0]);
  }

  private extractKeywords(queries: string[]): string[] {
    // Simple keyword extraction - split queries and find common terms
    const words = queries
      .flatMap((query) => query.toLowerCase().split(' '))
      .filter((word) => word.length > 3); // Filter out short words

    return this.getMostFrequent(words, 5);
  }

  /**
   * Export filter configuration
   */
  public exportFilter(userId: string): FilterConfig | null {
    return this.userFilters.get(userId) || null;
  }

  /**
   * Import filter configuration
   */
  public importFilter(userId: string, config: FilterConfig): void {
    this.userFilters.set(userId, config);
  }

  /**
   * Get filter statistics
   */
  public getFilterStats(): {
    totalUsers: number;
    mostUsedFilters: Record<string, number>;
    averageFiltersPerUser: number;
  } {
    const allFilters = Array.from(this.userFilters.values());
    const filterTypes: Record<string, number> = {};

    for (const filter of allFilters) {
      if (filter.messageTypes) filterTypes['messageTypes'] = (filterTypes['messageTypes'] || 0) + 1;
      if (filter.agentTypes) filterTypes['agentTypes'] = (filterTypes['agentTypes'] || 0) + 1;
      if (filter.priorities) filterTypes['priorities'] = (filterTypes['priorities'] || 0) + 1;
      if (filter.timeRange) filterTypes['timeRange'] = (filterTypes['timeRange'] || 0) + 1;
      if (filter.contentKeywords)
        filterTypes['contentKeywords'] = (filterTypes['contentKeywords'] || 0) + 1;
      if (filter.hasReasoning !== undefined)
        filterTypes['hasReasoning'] = (filterTypes['hasReasoning'] || 0) + 1;
    }

    return {
      totalUsers: this.userFilters.size,
      mostUsedFilters: filterTypes,
      averageFiltersPerUser: allFilters.length / this.userFilters.size || 0,
    };
  }
}
