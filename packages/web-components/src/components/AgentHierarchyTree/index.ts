/**
 * AgentHierarchyTree Component - Barrel Export
 * Consolidates exports for clean imports
 */

export { AgentHierarchyTree, default } from './AgentHierarchyTree';
export type {
  AgentHierarchyNode,
  AgentHierarchyTreeProps,
  AgentState,
  AgentType,
  TreeNodeProps,
} from './AgentHierarchyTree.types';
export {
  stateColors,
  typeColors,
  getHealthColor,
  getConfidenceColor,
} from './AgentHierarchyTree.styles';
