# Advanced Data Visualization Components

This directory contains a comprehensive suite of interactive data visualization components designed for real-time monitoring and analysis of agent orchestration systems.

## Components Overview

### 1. AgentHierarchyTree
An interactive tree visualization showing the hierarchical structure of agents in the swarm.

**Features:**
- D3.js force-directed layout
- Real-time status updates
- Interactive node selection and hovering
- Agent type and status color coding
- Confidence indicators
- Zoom and pan capabilities
- Animated transitions

**Usage:**
```tsx
import { AgentHierarchyTree, type AgentNode } from './visualizations';

const agentData: AgentNode = {
  id: 'root',
  name: 'Coordinator',
  type: 'coordinator',
  status: 'active',
  confidence: 0.95,
  children: [...]
};

<AgentHierarchyTree
  data={agentData}
  width={800}
  height={600}
  realTimeUpdates={true}
  theme="light"
  showMetrics={true}
  animationsEnabled={true}
/>
```

### 2. PerformanceCharts
Comprehensive performance monitoring using Chart.js with multiple chart types.

**Features:**
- Real-time line charts for system metrics
- Bar charts for agent performance comparison
- Doughnut charts for task completion overview
- Scatter plots for agent relationship analysis
- Multiple time ranges (1h, 6h, 24h, 7d)
- Export functionality
- Fullscreen mode
- Responsive design

**Usage:**
```tsx
import { PerformanceCharts, type PerformanceMetrics, type AgentPerformanceData } from './visualizations';

<PerformanceCharts
  systemMetrics={performanceData}
  agentData={agentPerformanceData}
  width={1200}
  height={800}
  realTimeUpdates={true}
  theme="dark"
  chartType="mixed"
  timeRange="24h"
  showGrid={true}
/>
```

### 3. ResourceGauges
Visual representation of system resource usage with multiple gauge styles.

**Features:**
- Arc, linear, and radial gauge styles
- Real-time resource monitoring
- Interactive heatmaps for agent-specific usage
- Color-coded severity indicators
- Responsive layouts
- Animated value transitions

**Usage:**
```tsx
import { ResourceGauges, type ResourceMetrics, type AgentResourceData } from './visualizations';

<ResourceGauges
  resourceMetrics={systemResources}
  agentData={agentResources}
  heatmapData={heatmapData}
  width={1000}
  height={600}
  gaugeStyle="arc"
  theme="light"
  showLabels={true}
  animationsEnabled={true}
/>
```

### 4. EventTimeline
Interactive timeline visualization for system events and agent activities.

**Features:**
- Chronological event display
- Multiple grouping modes (category, agent, severity)
- Interactive event details
- Real-time updates
- Filtering by time range
- Custom event types and categories
- Animated event appearance

**Usage:**
```tsx
import { EventTimeline, type TimelineEvent } from './visualizations';

<EventTimeline
  events={timelineEvents}
  width={1200}
  height={400}
  realTimeUpdates={true}
  theme="light"
  showCategories={true}
  showAgents={true}
  timeRange="24h"
  groupingMode="category"
/>
```

### 5. AgentNetworkTopology
Network graph showing agent relationships and communication patterns.

**Features:**
- Force-directed layout
- Multiple layout options (force, hierarchical, circular, clustered)
- Interactive node dragging
- Link strength and traffic visualization
- Clustering support
- Real-time updates
- Performance and traffic metrics overlay

**Usage:**
```tsx
import { AgentNetworkTopology, type NetworkNode, type NetworkLink } from './visualizations';

<AgentNetworkTopology
  nodes={networkNodes}
  links={networkLinks}
  clusters={networkClusters}
  width={1000}
  height={600}
  realTimeUpdates={true}
  layoutType="force"
  metricsMode="performance"
  clusteringEnabled={true}
/>
```

### 6. Dashboard
Comprehensive dashboard component that integrates all visualizations.

**Features:**
- Multiple layout options (grid, tabs, stacked)
- Real-time data integration
- Export functionality
- Fullscreen mode
- Responsive design
- Theme support (light/dark)
- Configurable update intervals

**Usage:**
```tsx
import { Dashboard, type DashboardData } from './visualizations';

const dashboardData: DashboardData = {
  agents: agentNodes,
  performanceMetrics: systemMetrics,
  agentPerformanceData: agentPerfData,
  resourceMetrics: resources,
  agentResourceData: agentResources,
  heatmapData: heatmaps,
  timelineEvents: events,
  networkNodes: networkNodes,
  networkLinks: networkLinks,
  networkClusters: clusters,
};

<Dashboard
  data={dashboardData}
  width={1400}
  height={900}
  layout="tabs"
  theme="light"
  realTimeUpdates={true}
  autoRefresh={true}
/>
```

## Installation

Install the required dependencies:

```bash
npm install d3 @types/d3 chart.js react-chartjs-2 chartjs-adapter-date-fns
```

## Styling and Theming

All components support light and dark themes through the `theme` prop. Components use consistent color schemes and can be customized through CSS variables or inline styles.

### Theme Colors

```tsx
const themeColors = {
  light: {
    background: '#ffffff',
    text: '#1f2937',
    border: '#e5e7eb',
    grid: '#f3f4f6',
    // ... more colors
  },
  dark: {
    background: '#1f2937',
    text: '#f9fafb',
    border: '#374151',
    grid: '#4b5563',
    // ... more colors
  }
};
```

## Real-time Updates

All components support real-time updates through the `realTimeUpdates` and `updateInterval` props. When enabled, components will automatically refresh their data at the specified interval.

```tsx
<Component
  realTimeUpdates={true}
  updateInterval={5000} // 5 seconds
/>
```

## Performance Considerations

- Use appropriate `updateInterval` values to balance real-time updates with performance
- Limit the number of data points for large datasets
- Disable animations (`animationsEnabled={false}`) for better performance on slower devices
- Use the `maxEvents` prop to limit timeline events
- Consider using clustering for network topology with many nodes

## Accessibility

All components include:
- Keyboard navigation support
- Screen reader compatibility
- High contrast color schemes
- Focus indicators
- ARIA labels and descriptions

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Contributing

When adding new visualization components:

1. Follow the existing component structure and naming conventions
2. Include TypeScript interfaces for all props and data structures
3. Add comprehensive JSDoc comments
4. Implement real-time update support
5. Include accessibility features
6. Add responsive design considerations
7. Update this README with component documentation

## License

These components are part of the Claude Flow Novice project and follow the same license terms.