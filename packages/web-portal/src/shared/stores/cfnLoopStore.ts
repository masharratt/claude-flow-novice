/**
 * CFN Loop Store - Manages CFN Loop phases, metrics, and validator results
 * Features: localStorage persistence (1h TTL), Immer middleware, DevTools
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export interface CFNPhase {
  id: string;
  number: number;
  name: string;
  sprints: CFNSprint[];
  completed: boolean;
  startedAt?: number;
  completedAt?: number;
}

export interface CFNSprint {
  id: string;
  name: string;
  completed: boolean;
}

export interface CFNLoopMetrics {
  gateThreshold: number;
  consensusThreshold: number;
  avgLoop3Confidence: number;
  avgLoop2Consensus: number;
}

export interface CFNLoopState {
  currentLoopNumber: number;
  currentPhaseName: string;
  validators: number;
  phases: CFNPhase[];
  metrics: CFNLoopMetrics;
  validatorResults: ValidatorResult[];
  loop3Progress: number;
  loop2Progress: number;
  loading: boolean;
  error: string | null;
}

export interface ValidatorResult {
  id: string;
  name: string;
  status: 'pending' | 'passed' | 'failed';
  confidence: number;
  issues: string[];
}

interface CFNLoopActions {
  setCurrentLoop: (loopNumber: number, phaseName: string) => void;
  setPhases: (phases: CFNPhase[]) => void;
  updatePhaseCompletion: (phaseId: string, completed: boolean) => void;
  setMetrics: (metrics: Partial<CFNLoopMetrics>) => void;
  setValidatorResults: (results: ValidatorResult[]) => void;
  setLoop3Progress: (progress: number) => void;
  setLoop2Progress: (progress: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type CFNLoopStore = CFNLoopState & CFNLoopActions;

const initialState: CFNLoopState = {
  currentLoopNumber: 3,
  currentPhaseName: 'Sprint 3.3',
  validators: 4,
  phases: [],
  metrics: {
    gateThreshold: 0.75,
    consensusThreshold: 0.90,
    avgLoop3Confidence: 0,
    avgLoop2Consensus: 0,
  },
  validatorResults: [],
  loop3Progress: 0,
  loop2Progress: 0,
  loading: false,
  error: null,
};

export const useCFNLoopStore = create<CFNLoopStore>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,

        setCurrentLoop: (loopNumber, phaseName) => set((state) => {
          state.currentLoopNumber = loopNumber;
          state.currentPhaseName = phaseName;
        }),

        setPhases: (phases) => set((state) => {
          state.phases = phases;
        }),

        updatePhaseCompletion: (phaseId, completed) => set((state) => {
          const phase = state.phases.find((p) => p.id === phaseId);
          if (phase) {
            phase.completed = completed;
            if (completed) {
              phase.completedAt = Date.now();
            }
          }
        }),

        setMetrics: (metrics) => set((state) => {
          state.metrics = { ...state.metrics, ...metrics };
        }),

        setValidatorResults: (results) => set((state) => {
          state.validatorResults = results;
        }),

        setLoop3Progress: (progress) => set((state) => {
          state.loop3Progress = progress;
        }),

        setLoop2Progress: (progress) => set((state) => {
          state.loop2Progress = progress;
        }),

        setLoading: (loading) => set((state) => {
          state.loading = loading;
        }),

        setError: (error) => set((state) => {
          state.error = error;
        }),

        reset: () => set(() => initialState),
      })),
      {
        name: 'cfn-loop-store',
        version: 1,
        partialize: (state) => ({
          currentLoopNumber: state.currentLoopNumber,
          currentPhaseName: state.currentPhaseName,
          phases: state.phases,
          metrics: state.metrics,
        }),
        storage: {
          getItem: (name) => {
            const item = localStorage.getItem(name);
            if (!item) return null;

            try {
              const { state, timestamp } = JSON.parse(item);
              const now = Date.now();
              const TTL = 60 * 60 * 1000; // 1 hour

              if (now - timestamp > TTL) {
                localStorage.removeItem(name);
                return null;
              }

              return state;
            } catch {
              return null;
            }
          },
          setItem: (name, value) => {
            const item = JSON.stringify({
              state: value,
              timestamp: Date.now(),
            });
            localStorage.setItem(name, item);
          },
          removeItem: (name) => localStorage.removeItem(name),
        },
      }
    ),
    { name: 'CFNLoopStore', enabled: process.env.NODE_ENV === 'development' }
  )
);

// Expose store for E2E tests
if (typeof window !== 'undefined' && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')) {
  (window as any).__cfnLoopStore = useCFNLoopStore;
}
