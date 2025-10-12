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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};
