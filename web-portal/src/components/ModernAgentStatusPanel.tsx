import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from './ui/table';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';

interface AgentStatus {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error' | 'waiting';
  progress: number;
  startTime: string;
}

const ModernAgentStatusPanel: React.FC = () => {
  // Mock data - replace with actual agent status data
  const agentStatuses: AgentStatus[] = [
    {
      id: 'agent-001',
      name: 'Backend Developer',
      status: 'running',
      progress: 65,
      startTime: '2025-10-24T10:30:00Z'
    },
    {
      id: 'agent-002',
      name: 'UI Designer',
      status: 'completed',
      progress: 100,
      startTime: '2025-10-24T09:15:00Z'
    },
    {
      id: 'agent-003',
      name: 'Security Validator',
      status: 'waiting',
      progress: 0,
      startTime: '2025-10-24T11:45:00Z'
    }
  ];

  const getStatusBadgeVariant = (status: AgentStatus['status']) => {
    switch (status) {
      case 'running': return 'outline';
      case 'completed': return 'success';
      case 'error': return 'destructive';
      case 'waiting': return 'secondary';
      default: return 'default';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Status Panel</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Start Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agentStatuses.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell>{agent.id}</TableCell>
                <TableCell>{agent.name}</TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(agent.status)}>
                    {agent.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full"
                      style={{ width: `${agent.progress}%` }}
                    ></div>
                  </div>
                </TableCell>
                <TableCell>{agent.startTime}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Separator className="my-4" />
        <div className="text-sm text-muted-foreground text-center">
          Last updated: {new Date().toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
};

export default ModernAgentStatusPanel;