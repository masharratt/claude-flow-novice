import type { RouteObject } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import GroupIcon from '@mui/icons-material/Group';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import SpeedIcon from '@mui/icons-material/Speed';
import TimelineIcon from '@mui/icons-material/Timeline';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import LoopIcon from '@mui/icons-material/Loop';
import BuildIcon from '@mui/icons-material/Build';
import SettingsIcon from '@mui/icons-material/Settings';
import type { SvgIconComponent } from '@mui/icons-material';

export interface RouteConfig {
  path: string;
  title: string;
  icon: SvgIconComponent;
  description?: string;
  showInNav?: boolean;
}

export const routeConfigs: RouteConfig[] = [
  {
    path: '/',
    title: 'Dashboard',
    icon: DashboardIcon,
    description: 'Overview and key metrics',
    showInNav: true,
  },
  {
    path: '/agents',
    title: 'Agents',
    icon: GroupIcon,
    description: 'Agent list and management',
    showInNav: true,
  },
  {
    path: '/hierarchy',
    title: 'Hierarchy',
    icon: AccountTreeIcon,
    description: 'Agent hierarchy visualization',
    showInNav: true,
  },
  {
    path: '/performance',
    title: 'Performance',
    icon: SpeedIcon,
    description: 'Performance metrics and analytics',
    showInNav: true,
  },
  {
    path: '/events',
    title: 'Events',
    icon: TimelineIcon,
    description: 'Event timeline and history',
    showInNav: true,
  },
  {
    path: '/fleet',
    title: 'Fleet',
    icon: ViewQuiltIcon,
    description: 'Fleet overview and status',
    showInNav: true,
  },
  {
    path: '/cfn-loop',
    title: 'CFN Loop',
    icon: LoopIcon,
    description: 'CFN Loop visualization',
    showInNav: true,
  },
  {
    path: '/intervention',
    title: 'Intervention',
    icon: BuildIcon,
    description: 'Agent intervention controls',
    showInNav: true,
  },
  {
    path: '/settings',
    title: 'Settings',
    icon: SettingsIcon,
    description: 'Application settings',
    showInNav: true,
  },
];

export const getRouteConfig = (path: string): RouteConfig | undefined => {
  return routeConfigs.find((route) => route.path === path);
};

export const getNavigationRoutes = (): RouteConfig[] => {
  return routeConfigs.filter((route) => route.showInNav);
};
