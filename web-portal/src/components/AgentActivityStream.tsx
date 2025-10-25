import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';

interface AgentActivity {
  channel: string;
  agentId: string;
  type: 'start' | 'progress' | 'complete' | 'error';
  message: string;
  timestamp: number;
}

const AgentActivityStream: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activities, setActivities] = useState<AgentActivity[]>([]);

  useEffect(() => {
    // Create Socket.IO connection
    const newSocket = io('http://localhost:3001', {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    setSocket(newSocket);

    // Subscribe to Redis channels
    const channels = ['swarm:*', 'screenshot:*', 'cfn_loop:*'];
    channels.forEach(channel => {
      newSocket.on(channel, (data: AgentActivity) => {
        setActivities((prevActivities) => [data, ...prevActivities].slice(0, 50));
      });
    });

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket');
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from WebSocket');
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const getBadgeVariant = (type: AgentActivity['type']) => {
    switch (type) {
      case 'start': return 'default';
      case 'progress': return 'outline';
      case 'complete': return 'secondary';
      case 'error': return 'destructive';
      default: return 'default';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Activity Stream</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] w-full">
          {activities.map((activity, index) => (
            <div key={index} className="flex items-center space-x-2 mb-2">
              <Badge variant={getBadgeVariant(activity.type)}>
                {activity.type}
              </Badge>
              <span>{activity.channel}</span>
              <span>{activity.agentId}</span>
              <span className="text-muted-foreground">{activity.message}</span>
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default AgentActivityStream;