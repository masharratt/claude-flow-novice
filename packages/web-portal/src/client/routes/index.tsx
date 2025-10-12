import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { Dashboard } from '../views/Dashboard';
import { Agents } from '../views/Agents';
import { Hierarchy } from '../views/Hierarchy';
import { Performance } from '../views/Performance';
import { Events } from '../views/Events';
import { Fleet } from '../views/Fleet';
import { CFNLoop } from '../views/CFNLoop';
import { Intervention } from '../views/Intervention';
import { Settings } from '../views/Settings';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="agents" element={<Agents />} />
        <Route path="hierarchy" element={<Hierarchy />} />
        <Route path="performance" element={<Performance />} />
        <Route path="events" element={<Events />} />
        <Route path="fleet" element={<Fleet />} />
        <Route path="cfn-loop" element={<CFNLoop />} />
        <Route path="intervention" element={<Intervention />} />
        <Route path="settings" element={<Settings />} />

        {/* Legacy portal redirects - archived 2025-10-12 */}
        <Route path="dashboard" element={<Navigate to="/" replace />} />
        <Route path="agent-management" element={<Navigate to="/agents" replace />} />
        <Route path="agent-portal" element={<Navigate to="/agents" replace />} />
        <Route path="metrics-dashboard" element={<Navigate to="/performance" replace />} />
        <Route path="metrics" element={<Navigate to="/performance" replace />} />
        <Route path="hierarchy-viewer" element={<Navigate to="/hierarchy" replace />} />
        <Route path="event-log" element={<Navigate to="/events" replace />} />
        <Route path="event-viewer" element={<Navigate to="/events" replace />} />
        <Route path="swarm-coordinator" element={<Navigate to="/fleet" replace />} />
        <Route path="swarms" element={<Navigate to="/fleet" replace />} />
        <Route path="cfn-monitor" element={<Navigate to="/cfn-loop" replace />} />
        <Route path="cfn-dashboard" element={<Navigate to="/cfn-loop" replace />} />
        <Route path="performance-dashboard" element={<Navigate to="/performance" replace />} />
        <Route path="settings-panel" element={<Navigate to="/settings" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};
