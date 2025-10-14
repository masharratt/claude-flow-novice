import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Alert,
  Paper,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider
} from '@mui/material';
import { io, Socket } from 'socket.io-client';

interface DashboardMetrics {
  activeAgents: number;
  completedAgents: number;
  failedAgents: number;
  totalCost: number;
  totalTokens: number;
  avgConfidence: number;
}

interface ActivityItem {
  id: string;
  timestamp: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface DashboardProps {}

const Dashboard: React.FC<DashboardProps> = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    activeAgents: 0,
    completedAgents: 0,
    failedAgents: 0,
    totalCost: 0,
    totalTokens: 0,
    avgConfidence: 0
  });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io('http://localhost:3000');
    setSocket(newSocket);

    // Join dashboard room
    newSocket.emit('join-dashboard');

    // Listen for metrics updates
    newSocket.on('metrics-update', (newMetrics: DashboardMetrics) => {
      setMetrics(newMetrics);
    });

    // Listen for activity updates
    newSocket.on('activity-update', (activity: ActivityItem) => {
      setActivities(prev => [activity, ...prev].slice(0, 10)); // Keep last 10 activities
    });

    // Fetch initial data
    fetchDashboardData();

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/coordinator/metrics');
      const result = await response.json();

      if (result.success) {
        setMetrics(result.data);
        setActivities([]);
      } else {
        setError('Failed to fetch dashboard data');
      }
    } catch (err) {
      setError('Network error while fetching dashboard data');
      console.error('Error fetching dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence: number): 'success' | 'warning' | 'error' => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    return 'error';
  };

  const getActivityColor = (type: string): 'success' | 'error' | 'info' => {
    switch (type) {
      case 'success': return 'success';
      case 'error': return 'error';
      default: return 'info';
    }
  };

  if (loading) {
    return (
      <Box p={3}>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <LinearProgress />
        <Typography variant="body2" sx={{ mt: 2 }}>
          Loading dashboard metrics...
        </Typography>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Metrics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Active Agents
              </Typography>
              <Typography variant="h3" component="div">
                {metrics.activeAgents}
              </Typography>
              <Chip
                label="Running"
                color="primary"
                size="small"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Completed Agents
              </Typography>
              <Typography variant="h3" component="div">
                {metrics.completedAgents}
              </Typography>
              <Chip
                label="Success"
                color="success"
                size="small"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Failed Agents
              </Typography>
              <Typography variant="h3" component="div">
                {metrics.failedAgents}
              </Typography>
              <Chip
                label="Failed"
                color="error"
                size="small"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Cost
              </Typography>
              <Typography variant="h3" component="div">
                ${metrics.totalCost.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {metrics.totalTokens.toLocaleString()} tokens
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Average Confidence
              </Typography>
              <Typography variant="h3" component="div">
                {(metrics.avgConfidence * 100).toFixed(0)}%
              </Typography>
              <Chip
                label={metrics.avgConfidence >= 0.75 ? 'High' : 'Low'}
                color={getConfidenceColor(metrics.avgConfidence)}
                size="small"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                System Status
              </Typography>
              <Typography variant="h5" component="div">
                Operational
              </Typography>
              <Chip
                label="Healthy"
                color="success"
                size="small"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Activity Feed */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Recent Activity
        </Typography>
        {activities.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No recent activity to display
          </Typography>
        ) : (
          <List>
            {activities.map((activity, index) => (
              <React.Fragment key={activity.id}>
                <ListItem>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Chip
                          label={activity.type}
                          color={getActivityColor(activity.type)}
                          size="small"
                        />
                        <Typography variant="body2">
                          {activity.message}
                        </Typography>
                      </Box>
                    }
                    secondary={new Date(activity.timestamp).toLocaleString()}
                  />
                </ListItem>
                {index < activities.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        )}
      </Paper>

      {/* Connection Status */}
      {socket && (
        <Alert
          severity={socket.connected ? 'success' : 'warning'}
          sx={{ mt: 2 }}
        >
          {socket.connected
            ? 'Connected to real-time updates'
            : 'Connecting to real-time updates...'}
        </Alert>
      )}
    </Box>
  );
};

export default Dashboard;
