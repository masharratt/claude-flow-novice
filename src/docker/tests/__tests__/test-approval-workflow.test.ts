/**
 * Approval Workflow Test Suite
 * Tests approval workflow with state transitions, notifications, and SLA tracking
 *
 * Migration from: docker/tests/test-approval-workflow.sh
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

enum ApprovalState {
  Draft = 'draft',
  PendingExpertReview = 'pending_expert_review',
  ExpertReviewing = 'expert_reviewing',
  Approved = 'approved',
  Rejected = 'rejected',
  NeedsCorrection = 'needs_correction',
  PendingDeployment = 'pending_deployment',
  Deployed = 'deployed',
  Active = 'active',
  DeploymentFailed = 'deployment_failed'
}

interface ApprovalWorkflow {
  skillId: string;
  state: ApprovalState;
  expert: string;
  createdAt: Date;
  updatedAt: Date;
  slaDeadline: Date;
  auditTrail: Array<{ timestamp: Date; action: string; actor: string; notes?: string }>;
}

class ApprovalWorkflowManager {
  private tempDir: string;

  constructor(tempDir: string = tmpdir()) {
    this.tempDir = tempDir;
  }

  /**
   * Initialize a new approval workflow
   */
  initApproval(skillId: string, expert: string): ApprovalWorkflow {
    const now = new Date();
    const slaDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    return {
      skillId,
      state: ApprovalState.Draft,
      expert,
      createdAt: now,
      updatedAt: now,
      slaDeadline,
      auditTrail: [{
        timestamp: now,
        action: 'created',
        actor: 'system'
      }]
    };
  }

  /**
   * Validate state transition
   */
  private isValidTransition(currentState: ApprovalState, newState: ApprovalState): boolean {
    const validTransitions: { [key in ApprovalState]: ApprovalState[] } = {
      [ApprovalState.Draft]: [ApprovalState.PendingExpertReview],
      [ApprovalState.PendingExpertReview]: [ApprovalState.ExpertReviewing],
      [ApprovalState.ExpertReviewing]: [
        ApprovalState.Approved,
        ApprovalState.Rejected,
        ApprovalState.NeedsCorrection
      ],
      [ApprovalState.NeedsCorrection]: [ApprovalState.Draft],
      [ApprovalState.Approved]: [ApprovalState.PendingDeployment],
      [ApprovalState.PendingDeployment]: [ApprovalState.Deployed, ApprovalState.DeploymentFailed],
      [ApprovalState.Deployed]: [ApprovalState.Active],
      [ApprovalState.DeploymentFailed]: [ApprovalState.PendingDeployment],
      [ApprovalState.Rejected]: [ApprovalState.Draft],
      [ApprovalState.Active]: [ApprovalState.Active] // Can stay active
    };

    return validTransitions[currentState]?.includes(newState) ?? false;
  }

  /**
   * Transition workflow state
   */
  transitionState(
    workflow: ApprovalWorkflow,
    newState: ApprovalState,
    actor: string = 'system',
    notes: string = ''
  ): { success: boolean; error?: string } {
    if (!this.isValidTransition(workflow.state, newState)) {
      return {
        success: false,
        error: `Invalid transition from ${workflow.state} to ${newState}`
      };
    }

    const timestamp = new Date();
    workflow.state = newState;
    workflow.updatedAt = timestamp;
    workflow.auditTrail.push({
      timestamp,
      action: `transitioned_to_${newState}`,
      actor,
      notes: notes || undefined
    });

    return { success: true };
  }

  /**
   * Check SLA compliance
   */
  checkSLACompliance(workflow: ApprovalWorkflow): {
    compliant: boolean;
    timeRemaining: number;
    isOverdue: boolean;
  } {
    const now = new Date();
    const timeRemaining = workflow.slaDeadline.getTime() - now.getTime();
    const isOverdue = timeRemaining < 0;
    const compliant = !isOverdue;

    return { compliant, timeRemaining, isOverdue };
  }

  /**
   * Get audit trail for workflow
   */
  getAuditTrail(workflow: ApprovalWorkflow): Array<any> {
    return workflow.auditTrail;
  }

  /**
   * Serialize workflow to JSON
   */
  serializeWorkflow(workflow: ApprovalWorkflow): string {
    return JSON.stringify({
      skillId: workflow.skillId,
      state: workflow.state,
      expert: workflow.expert,
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
      slaDeadline: workflow.slaDeadline.toISOString(),
      auditTrail: workflow.auditTrail.map(entry => ({
        ...entry,
        timestamp: entry.timestamp.toISOString()
      }))
    });
  }

  /**
   * Deserialize workflow from JSON
   */
  deserializeWorkflow(json: string): ApprovalWorkflow {
    const data = JSON.parse(json);
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      slaDeadline: new Date(data.slaDeadline),
      auditTrail: data.auditTrail.map((entry: any) => ({
        ...entry,
        timestamp: new Date(entry.timestamp)
      }))
    };
  }
}

describe('Approval Workflow', () => {
  let manager: ApprovalWorkflowManager;

  beforeEach(() => {
    manager = new ApprovalWorkflowManager();
  });

  describe('Workflow Initialization', () => {
    it('should initialize a new approval workflow', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');

      expect(workflow.skillId).toBe('skill-123');
      expect(workflow.state).toBe(ApprovalState.Draft);
      expect(workflow.expert).toBe('expert-001');
      expect(workflow.createdAt).toBeInstanceOf(Date);
      expect(workflow.slaDeadline).toBeInstanceOf(Date);
    });

    it('should set SLA deadline 24 hours from creation', () => {
      const before = new Date();
      const workflow = manager.initApproval('skill-123', 'expert-001');
      const after = new Date();

      const expectedMin = before.getTime() + 24 * 60 * 60 * 1000;
      const expectedMax = after.getTime() + 24 * 60 * 60 * 1000;

      expect(workflow.slaDeadline.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(workflow.slaDeadline.getTime()).toBeLessThanOrEqual(expectedMax + 1000);
    });

    it('should initialize with draft state', () => {
      const workflow = manager.initApproval('skill-456', 'expert-002');
      expect(workflow.state).toBe(ApprovalState.Draft);
    });
  });

  describe('State Transitions', () => {
    it('should transition from draft to pending_expert_review', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');
      const result = manager.transitionState(workflow, ApprovalState.PendingExpertReview, 'user-123');

      expect(result.success).toBe(true);
      expect(workflow.state).toBe(ApprovalState.PendingExpertReview);
    });

    it('should reject invalid state transition', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');
      // Can't jump directly to Deployed
      const result = manager.transitionState(workflow, ApprovalState.Deployed, 'user-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
      expect(workflow.state).toBe(ApprovalState.Draft); // Should not change
    });

    it('should support approval after expert review', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');

      manager.transitionState(workflow, ApprovalState.PendingExpertReview);
      manager.transitionState(workflow, ApprovalState.ExpertReviewing);
      const result = manager.transitionState(workflow, ApprovalState.Approved, 'expert-001');

      expect(result.success).toBe(true);
      expect(workflow.state).toBe(ApprovalState.Approved);
    });

    it('should support rejection after expert review', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');

      manager.transitionState(workflow, ApprovalState.PendingExpertReview);
      manager.transitionState(workflow, ApprovalState.ExpertReviewing);
      const result = manager.transitionState(workflow, ApprovalState.Rejected, 'expert-001');

      expect(result.success).toBe(true);
      expect(workflow.state).toBe(ApprovalState.Rejected);
    });

    it('should support needs_correction state', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');

      manager.transitionState(workflow, ApprovalState.PendingExpertReview);
      manager.transitionState(workflow, ApprovalState.ExpertReviewing);
      const result = manager.transitionState(workflow, ApprovalState.NeedsCorrection, 'expert-001');

      expect(result.success).toBe(true);
      expect(workflow.state).toBe(ApprovalState.NeedsCorrection);
    });

    it('should allow loop back to draft from needs_correction', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');

      manager.transitionState(workflow, ApprovalState.PendingExpertReview);
      manager.transitionState(workflow, ApprovalState.ExpertReviewing);
      manager.transitionState(workflow, ApprovalState.NeedsCorrection);
      const result = manager.transitionState(workflow, ApprovalState.Draft, 'user-123');

      expect(result.success).toBe(true);
      expect(workflow.state).toBe(ApprovalState.Draft);
    });
  });

  describe('SLA Tracking', () => {
    it('should check SLA compliance', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');
      const sla = manager.checkSLACompliance(workflow);

      expect(sla).toHaveProperty('compliant');
      expect(sla).toHaveProperty('timeRemaining');
      expect(sla).toHaveProperty('isOverdue');
      expect(sla.compliant).toBe(true);
      expect(sla.isOverdue).toBe(false);
    });

    it('should detect overdue SLA', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');
      // Set SLA deadline to past
      workflow.slaDeadline = new Date(Date.now() - 1000);

      const sla = manager.checkSLACompliance(workflow);
      expect(sla.isOverdue).toBe(true);
      expect(sla.compliant).toBe(false);
    });

    it('should calculate remaining time correctly', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');
      const expectedRemaining = workflow.slaDeadline.getTime() - Date.now();

      const sla = manager.checkSLACompliance(workflow);
      expect(sla.timeRemaining).toBeLessThanOrEqual(expectedRemaining);
      expect(sla.timeRemaining).toBeGreaterThan(expectedRemaining - 1000); // Allow 1s margin
    });
  });

  describe('Audit Trail', () => {
    it('should track state transitions in audit trail', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');
      manager.transitionState(workflow, ApprovalState.PendingExpertReview, 'user-123', 'Submitted for review');

      const trail = manager.getAuditTrail(workflow);
      expect(trail.length).toBeGreaterThan(1);
      expect(trail[1].action).toContain('pending_expert_review');
    });

    it('should include actor information in audit trail', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');
      manager.transitionState(workflow, ApprovalState.PendingExpertReview, 'user-456', 'Ready for review');

      const trail = manager.getAuditTrail(workflow);
      const lastEntry = trail[trail.length - 1];
      expect(lastEntry.actor).toBe('user-456');
    });

    it('should include optional notes in audit trail', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');
      const notes = 'Submitted for expert review';
      manager.transitionState(workflow, ApprovalState.PendingExpertReview, 'user-123', notes);

      const trail = manager.getAuditTrail(workflow);
      const lastEntry = trail[trail.length - 1];
      expect(lastEntry.notes).toBe(notes);
    });
  });

  describe('Serialization', () => {
    it('should serialize workflow to JSON', () => {
      const workflow = manager.initApproval('skill-123', 'expert-001');
      const json = manager.serializeWorkflow(workflow);

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.skillId).toBe('skill-123');
      expect(parsed.state).toBe(ApprovalState.Draft);
    });

    it('should deserialize workflow from JSON', () => {
      const original = manager.initApproval('skill-123', 'expert-001');
      const json = manager.serializeWorkflow(original);
      const restored = manager.deserializeWorkflow(json);

      expect(restored.skillId).toBe(original.skillId);
      expect(restored.state).toBe(original.state);
      expect(restored.expert).toBe(original.expert);
      expect(restored.createdAt.getTime()).toBe(original.createdAt.getTime());
    });
  });
});
