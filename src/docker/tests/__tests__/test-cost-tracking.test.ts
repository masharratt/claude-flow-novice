/**
 * Cost Tracking Test Suite
 * Tests cost tracking, budgeting, and resource accounting
 *
 * Migration from: docker/tests/test-cost-tracking.sh
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

interface CostItem {
  id: string;
  category: string;
  amount: number;
  currency: string;
  timestamp: Date;
  description: string;
}

interface BudgetAllocation {
  category: string;
  limit: number;
  spent: number;
  remaining: number;
}

class CostTracker {
  private costs: CostItem[] = [];
  private budgets: Map<string, number> = new Map();

  /**
   * Set budget for category
   */
  setBudget(category: string, amount: number): void {
    this.budgets.set(category, amount);
  }

  /**
   * Record a cost
   */
  recordCost(
    id: string,
    category: string,
    amount: number,
    currency: string = 'USD',
    description: string = ''
  ): void {
    this.costs.push({
      id,
      category,
      amount,
      currency,
      timestamp: new Date(),
      description
    });
  }

  /**
   * Get total cost by category
   */
  getTotalByCategory(category: string): number {
    return this.costs
      .filter(c => c.category === category)
      .reduce((sum, c) => sum + c.amount, 0);
  }

  /**
   * Get all costs
   */
  getAllCosts(): CostItem[] {
    return [...this.costs];
  }

  /**
   * Get budget allocation for category
   */
  getBudgetAllocation(category: string): BudgetAllocation {
    const limit = this.budgets.get(category) || 0;
    const spent = this.getTotalByCategory(category);
    const remaining = limit - spent;

    return {
      category,
      limit,
      spent,
      remaining
    };
  }

  /**
   * Check if over budget
   */
  isOverBudget(category: string): boolean {
    const allocation = this.getBudgetAllocation(category);
    return allocation.spent > allocation.limit;
  }

  /**
   * Get percentage of budget used
   */
  getBudgetPercentage(category: string): number {
    const allocation = this.getBudgetAllocation(category);
    return allocation.limit > 0 ? (allocation.spent / allocation.limit) * 100 : 0;
  }

  /**
   * Get total costs across all categories
   */
  getTotalCosts(): number {
    return this.costs.reduce((sum, c) => sum + c.amount, 0);
  }

  /**
   * Get total budgets
   */
  getTotalBudgets(): number {
    let total = 0;
    this.budgets.forEach(amount => {
      total += amount;
    });
    return total;
  }

  /**
   * Get budget summary
   */
  getBudgetSummary(): {
    totalBudget: number;
    totalSpent: number;
    totalRemaining: number;
    percentageUsed: number;
    categories: BudgetAllocation[];
  } {
    const categories = Array.from(this.budgets.keys()).map(cat => this.getBudgetAllocation(cat));
    const totalBudget = this.getTotalBudgets();
    const totalSpent = this.getTotalCosts();
    const totalRemaining = totalBudget - totalSpent;

    return {
      totalBudget,
      totalSpent,
      totalRemaining,
      percentageUsed: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
      categories
    };
  }

  /**
   * Get costs within date range
   */
  getCostsInDateRange(startDate: Date, endDate: Date): CostItem[] {
    return this.costs.filter(c =>
      c.timestamp >= startDate && c.timestamp <= endDate
    );
  }

  /**
   * Get average cost per category
   */
  getAverageCostPerCategory(category: string): number {
    const categoryCosts = this.costs.filter(c => c.category === category);
    if (categoryCosts.length === 0) return 0;
    return this.getTotalByCategory(category) / categoryCosts.length;
  }

  /**
   * Clear all costs
   */
  clearCosts(): void {
    this.costs = [];
  }
}

describe('Cost Tracking', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe('Budget Management', () => {
    it('should set budget for category', () => {
      tracker.setBudget('compute', 1000);
      const allocation = tracker.getBudgetAllocation('compute');

      expect(allocation.limit).toBe(1000);
      expect(allocation.spent).toBe(0);
      expect(allocation.remaining).toBe(1000);
    });

    it('should handle multiple budget categories', () => {
      tracker.setBudget('compute', 1000);
      tracker.setBudget('storage', 500);
      tracker.setBudget('network', 300);

      expect(tracker.getTotalBudgets()).toBe(1800);
    });

    it('should return zero budget for unset categories', () => {
      const allocation = tracker.getBudgetAllocation('nonexistent');
      expect(allocation.limit).toBe(0);
    });
  });

  describe('Cost Recording', () => {
    it('should record a cost', () => {
      tracker.setBudget('compute', 1000);
      tracker.recordCost('cost-1', 'compute', 100, 'USD', 'First cost');

      const costs = tracker.getAllCosts();
      expect(costs).toHaveLength(1);
      expect(costs[0].amount).toBe(100);
    });

    it('should record multiple costs', () => {
      tracker.setBudget('compute', 1000);
      tracker.recordCost('cost-1', 'compute', 100);
      tracker.recordCost('cost-2', 'compute', 200);
      tracker.recordCost('cost-3', 'compute', 150);

      expect(tracker.getAllCosts()).toHaveLength(3);
      expect(tracker.getTotalByCategory('compute')).toBe(450);
    });

    it('should timestamp recorded costs', () => {
      tracker.setBudget('compute', 1000);
      const before = new Date();
      tracker.recordCost('cost-1', 'compute', 100);
      const after = new Date();

      const cost = tracker.getAllCosts()[0];
      expect(cost.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(cost.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should include description in cost record', () => {
      tracker.setBudget('compute', 1000);
      tracker.recordCost('cost-1', 'compute', 100, 'USD', 'Test compute cost');

      const cost = tracker.getAllCosts()[0];
      expect(cost.description).toBe('Test compute cost');
    });
  });

  describe('Budget Calculations', () => {
    beforeEach(() => {
      tracker.setBudget('compute', 1000);
      tracker.recordCost('cost-1', 'compute', 250);
      tracker.recordCost('cost-2', 'compute', 250);
      tracker.recordCost('cost-3', 'compute', 250);
    });

    it('should calculate total by category', () => {
      expect(tracker.getTotalByCategory('compute')).toBe(750);
    });

    it('should calculate remaining budget', () => {
      const allocation = tracker.getBudgetAllocation('compute');
      expect(allocation.remaining).toBe(250);
    });

    it('should calculate budget percentage', () => {
      expect(tracker.getBudgetPercentage('compute')).toBe(75);
    });

    it('should detect when over budget', () => {
      tracker.recordCost('cost-4', 'compute', 300);
      expect(tracker.isOverBudget('compute')).toBe(true);
    });

    it('should return false when under budget', () => {
      expect(tracker.isOverBudget('compute')).toBe(false);
    });
  });

  describe('Summary Reports', () => {
    it('should generate budget summary', () => {
      tracker.setBudget('compute', 1000);
      tracker.setBudget('storage', 500);
      tracker.recordCost('cost-1', 'compute', 200);
      tracker.recordCost('cost-2', 'storage', 100);

      const summary = tracker.getBudgetSummary();
      expect(summary.totalBudget).toBe(1500);
      expect(summary.totalSpent).toBe(300);
      expect(summary.totalRemaining).toBe(1200);
      expect(summary.percentageUsed).toBe(20);
      expect(summary.categories).toHaveLength(2);
    });

    it('should include category details in summary', () => {
      tracker.setBudget('compute', 1000);
      tracker.setBudget('storage', 500);
      tracker.recordCost('cost-1', 'compute', 200);

      const summary = tracker.getBudgetSummary();
      const computeCategory = summary.categories.find(c => c.category === 'compute');

      expect(computeCategory).toBeDefined();
      expect(computeCategory?.spent).toBe(200);
      expect(computeCategory?.remaining).toBe(800);
    });
  });

  describe('Date Range Queries', () => {
    it('should get costs within date range', () => {
      tracker.setBudget('compute', 1000);

      const now = new Date();
      const past = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
      const future = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours future

      tracker.recordCost('cost-1', 'compute', 100);

      const costs = tracker.getCostsInDateRange(past, future);
      expect(costs).toHaveLength(1);
    });

    it('should exclude costs outside date range', () => {
      tracker.setBudget('compute', 1000);

      const now = new Date();
      const future1 = new Date(now.getTime() + 1 * 60 * 60 * 1000); // 1 hour future
      const future2 = new Date(now.getTime() + 25 * 60 * 60 * 1000); // 25 hours future

      tracker.recordCost('cost-1', 'compute', 100);

      const costs = tracker.getCostsInDateRange(future1, future2);
      expect(costs).toHaveLength(0);
    });
  });

  describe('Average Costs', () => {
    it('should calculate average cost per category', () => {
      tracker.setBudget('compute', 1000);
      tracker.recordCost('cost-1', 'compute', 100);
      tracker.recordCost('cost-2', 'compute', 200);
      tracker.recordCost('cost-3', 'compute', 300);

      const average = tracker.getAverageCostPerCategory('compute');
      expect(average).toBe(200);
    });

    it('should return zero average for empty category', () => {
      tracker.setBudget('compute', 1000);
      const average = tracker.getAverageCostPerCategory('compute');
      expect(average).toBe(0);
    });
  });

  describe('State Management', () => {
    it('should clear all costs', () => {
      tracker.setBudget('compute', 1000);
      tracker.recordCost('cost-1', 'compute', 100);
      tracker.recordCost('cost-2', 'compute', 200);

      expect(tracker.getAllCosts()).toHaveLength(2);

      tracker.clearCosts();
      expect(tracker.getAllCosts()).toHaveLength(0);
      expect(tracker.getTotalByCategory('compute')).toBe(0);
    });
  });
});
