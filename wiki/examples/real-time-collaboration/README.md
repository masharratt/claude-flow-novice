# Real-Time Collaboration and Monitoring Examples

Production-ready patterns for real-time collaboration, live monitoring, and distributed team coordination with Claude Flow.

## 🤝 Real-Time Team Collaboration

### Live Agent Coordination
```typescript
// Real-time agent collaboration with WebSocket coordination
interface AgentCollaborationSession {
  sessionId: string;
  participants: Agent[];
  sharedState: SharedState;
  communicationChannels: CommunicationChannel[];
  collaborationRules: CollaborationRule[];
}

Task("Collaboration Architect", `
  Design real-time agent collaboration system:
  - Set up WebSocket-based real-time communication
  - Implement shared state management with conflict resolution
  - Design collaborative editing and code review workflows
  - Set up real-time decision making and consensus protocols
  - Configure live progress tracking and visualization
`, "collaboration-architect");

Task("Real-time Engineer", `
  Implement real-time infrastructure:
  - Set up Socket.IO or native WebSocket servers
  - Implement operational transformation for collaborative editing
  - Configure Redis pub/sub for message broadcasting
  - Set up presence detection and user status tracking
  - Implement real-time notifications and alerts
`, "realtime-engineer");

Task("UX Engineer", `
  Build collaborative user interfaces:
  - Create real-time dashboards with live updates
  - Implement collaborative code editors with live cursors
  - Design real-time chat and communication interfaces
  - Build live activity feeds and notification systems
  - Create shared workspace and project visualizations
`, "frontend-dev");
```

### Distributed Team Coordination
```javascript
// Real-time distributed team coordination system
class DistributedTeamCoordinator {
  constructor() {
    this.websocketServer = new WebSocketServer();
    this.stateManager = new SharedStateManager();
    this.conflictResolver = new ConflictResolver();
    this.presenceManager = new PresenceManager();
    this.collaborationEngine = new CollaborationEngine();
  }

  async initializeSession(teamId, projectId, participants) {
    const session = new CollaborationSession({
      id: `${teamId}-${projectId}-${Date.now()}`,
      teamId,
      projectId,
      participants,
      createdAt: new Date(),
      state: 'active'
    });

    // Set up real-time communication channels
    await this.setupCommunicationChannels(session);

    // Initialize shared workspace
    await this.initializeSharedWorkspace(session);

    // Start presence tracking
    await this.presenceManager.startTracking(session);

    // Configure collaboration rules
    await this.configureCollaborationRules(session);

    return session;
  }

  async setupCommunicationChannels(session) {
    const channels = {
      // General team communication
      general: new CommunicationChannel('general', {
        type: 'broadcast',
        persistence: true,
        messageTypes: ['text', 'file', 'notification']
      }),

      // Agent coordination channel
      coordination: new CommunicationChannel('coordination', {
        type: 'structured',
        persistence: true,
        messageTypes: ['task_update', 'resource_request', 'status_change']
      }),

      // Code collaboration channel
      code: new CommunicationChannel('code', {
        type: 'operational_transform',
        persistence: true,
        messageTypes: ['edit', 'cursor', 'selection', 'comment']
      }),

      // Decision making channel
      decisions: new CommunicationChannel('decisions', {
        type: 'consensus',
        persistence: true,
        messageTypes: ['proposal', 'vote', 'decision']
      })
    };

    session.channels = channels;

    // Set up WebSocket endpoints for each channel
    for (const [channelName, channel] of Object.entries(channels)) {
      this.websocketServer.namespace(`/${session.id}/${channelName}`)
        .on('connection', (socket) => {
          this.handleChannelConnection(socket, channel, session);
        });
    }
  }

  async handleChannelConnection(socket, channel, session) {
    const userId = socket.handshake.auth.userId;
    const user = session.participants.find(p => p.id === userId);

    if (!user) {
      socket.disconnect();
      return;
    }

    // Add user to channel
    await channel.addParticipant(user);

    // Send current state
    socket.emit('initial_state', await channel.getCurrentState());

    // Handle real-time messages
    socket.on('message', async (message) => {
      await this.processChannelMessage(channel, user, message, session);
    });

    // Handle presence updates
    socket.on('presence_update', async (presence) => {
      await this.presenceManager.updatePresence(user.id, presence);
      await this.broadcastPresenceUpdate(session, user.id, presence);
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      await channel.removeParticipant(user);
      await this.presenceManager.setOffline(user.id);
    });
  }

  async processChannelMessage(channel, sender, message, session) {
    // Apply collaboration rules
    const isAllowed = await this.collaborationEngine.validateMessage(
      channel, sender, message, session
    );

    if (!isAllowed) {
      return;
    }

    // Process different message types
    switch (message.type) {
      case 'code_edit':
        await this.handleCodeEdit(channel, sender, message, session);
        break;

      case 'task_update':
        await this.handleTaskUpdate(channel, sender, message, session);
        break;

      case 'decision_proposal':
        await this.handleDecisionProposal(channel, sender, message, session);
        break;

      case 'resource_request':
        await this.handleResourceRequest(channel, sender, message, session);
        break;

      default:
        await this.handleGenericMessage(channel, sender, message, session);
    }
  }

  async handleCodeEdit(channel, sender, edit, session) {
    // Apply operational transformation
    const transformedEdit = await this.operationalTransform.transform(
      edit,
      channel.getDocumentState()
    );

    // Update shared document state
    await channel.updateDocumentState(transformedEdit);

    // Broadcast to all participants
    await this.broadcastToChannel(channel, {
      type: 'code_edit_applied',
      edit: transformedEdit,
      sender: sender.id,
      timestamp: new Date()
    });

    // Update activity feed
    await this.updateActivityFeed(session, {
      type: 'code_edit',
      user: sender.name,
      file: edit.file,
      description: `Modified ${edit.file} (${edit.changes.length} changes)`
    });
  }
}
```

## 📊 Live Monitoring and Dashboards

### Real-Time Performance Monitoring
```python
# Real-time performance monitoring with live dashboards
import asyncio
import websockets
import json
from typing import Dict, List, Any
from dataclasses import dataclass, asdict
from datetime import datetime

@dataclass
class MetricPoint:
    timestamp: datetime
    metric_name: str
    value: float
    labels: Dict[str, str]
    source: str

class RealTimeMonitoringSystem:
    def __init__(self):
        self.websocket_server = None
        self.connected_clients = set()
        self.metric_collectors = {}
        self.alert_engine = AlertEngine()
        self.dashboard_manager = DashboardManager()

    async def start_monitoring_server(self, host='localhost', port=8765):
        """Start the real-time monitoring WebSocket server"""
        self.websocket_server = await websockets.serve(
            self.handle_client_connection,
            host,
            port
        )

        # Start metric collection
        await asyncio.gather(
            self.collect_system_metrics(),
            self.collect_application_metrics(),
            self.collect_business_metrics(),
            self.process_alerts()
        )

    async def handle_client_connection(self, websocket, path):
        """Handle new client connections to monitoring dashboard"""
        self.connected_clients.add(websocket)

        try:
            # Send initial dashboard state
            initial_state = await self.dashboard_manager.get_initial_state()
            await websocket.send(json.dumps({
                'type': 'initial_state',
                'data': initial_state
            }))

            # Handle client messages
            async for message in websocket:
                await self.handle_client_message(websocket, json.loads(message))

        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.connected_clients.remove(websocket)

    async def collect_system_metrics(self):
        """Collect and broadcast system performance metrics"""
        while True:
            try:
                # CPU metrics
                cpu_usage = await self.get_cpu_usage()
                await self.broadcast_metric(MetricPoint(
                    timestamp=datetime.now(),
                    metric_name='cpu_usage_percent',
                    value=cpu_usage,
                    labels={'host': 'localhost'},
                    source='system'
                ))

                # Memory metrics
                memory_usage = await self.get_memory_usage()
                await self.broadcast_metric(MetricPoint(
                    timestamp=datetime.now(),
                    metric_name='memory_usage_percent',
                    value=memory_usage,
                    labels={'host': 'localhost'},
                    source='system'
                ))

                # Network metrics
                network_io = await self.get_network_io()
                await self.broadcast_metric(MetricPoint(
                    timestamp=datetime.now(),
                    metric_name='network_bytes_per_second',
                    value=network_io,
                    labels={'host': 'localhost', 'direction': 'total'},
                    source='system'
                ))

                await asyncio.sleep(1)  # Collect every second

            except Exception as e:
                print(f"Error collecting system metrics: {e}")
                await asyncio.sleep(5)

    async def collect_application_metrics(self):
        """Collect and broadcast application-specific metrics"""
        while True:
            try:
                # Agent performance metrics
                agent_metrics = await self.get_agent_performance_metrics()
                for agent_id, metrics in agent_metrics.items():
                    await self.broadcast_metric(MetricPoint(
                        timestamp=datetime.now(),
                        metric_name='agent_task_completion_rate',
                        value=metrics['completion_rate'],
                        labels={'agent_id': agent_id, 'agent_type': metrics['type']},
                        source='application'
                    ))

                # Task queue metrics
                queue_metrics = await self.get_task_queue_metrics()
                await self.broadcast_metric(MetricPoint(
                    timestamp=datetime.now(),
                    metric_name='task_queue_length',
                    value=queue_metrics['length'],
                    labels={'queue': 'main'},
                    source='application'
                ))

                # Response time metrics
                response_times = await self.get_response_time_metrics()
                for endpoint, response_time in response_times.items():
                    await self.broadcast_metric(MetricPoint(
                        timestamp=datetime.now(),
                        metric_name='response_time_ms',
                        value=response_time,
                        labels={'endpoint': endpoint},
                        source='application'
                    ))

                await asyncio.sleep(5)  # Collect every 5 seconds

            except Exception as e:
                print(f"Error collecting application metrics: {e}")
                await asyncio.sleep(10)

    async def broadcast_metric(self, metric: MetricPoint):
        """Broadcast metric to all connected dashboard clients"""
        if not self.connected_clients:
            return

        message = {
            'type': 'metric_update',
            'data': asdict(metric)
        }

        # Convert datetime to ISO string for JSON serialization
        message['data']['timestamp'] = metric.timestamp.isoformat()

        # Broadcast to all connected clients
        disconnected_clients = set()
        for client in self.connected_clients:
            try:
                await client.send(json.dumps(message))
            except websockets.exceptions.ConnectionClosed:
                disconnected_clients.add(client)

        # Remove disconnected clients
        self.connected_clients -= disconnected_clients

        # Check for alerts
        await self.alert_engine.check_metric(metric)

# Task orchestration for real-time monitoring
Task("Monitoring Engineer", """
  Set up real-time monitoring infrastructure:
  - Configure WebSocket servers for live metric streaming
  - Implement metric collection and aggregation systems
  - Set up real-time alerting and notification systems
  - Create live dashboard with customizable widgets
  - Configure performance baseline detection and anomaly alerts
""", "monitoring-engineer")

Task("Dashboard Developer", """
  Build real-time monitoring dashboards:
  - Create responsive dashboard layouts with live charts
  - Implement real-time data visualization components
  - Set up customizable alert panels and notification systems
  - Build drill-down capabilities for detailed metrics
  - Configure dashboard sharing and collaboration features
""", "frontend-dev")
```

### Live Agent Status Tracking
```typescript
// Real-time agent status and progress tracking
interface AgentStatus {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'working' | 'error' | 'offline';
  currentTask?: TaskStatus;
  performance: PerformanceMetrics;
  location: AgentLocation;
  lastUpdate: Date;
}

interface TaskStatus {
  id: string;
  description: string;
  progress: number; // 0-100
  estimatedCompletion: Date;
  subtasks: SubtaskStatus[];
}

class LiveAgentTracker {
  private websocketServer: WebSocketServer;
  private agentStatuses: Map<string, AgentStatus>;
  private connectedClients: Set<WebSocket>;

  constructor() {
    this.agentStatuses = new Map();
    this.connectedClients = new Set();
    this.websocketServer = new WebSocketServer({ port: 8080 });
    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers() {
    this.websocketServer.on('connection', (ws) => {
      this.connectedClients.add(ws);

      // Send current agent statuses
      ws.send(JSON.stringify({
        type: 'initial_state',
        agents: Array.from(this.agentStatuses.values())
      }));

      ws.on('close', () => {
        this.connectedClients.delete(ws);
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(ws, message);
      });
    });
  }

  async updateAgentStatus(agentId: string, update: Partial<AgentStatus>) {
    const existingStatus = this.agentStatuses.get(agentId);
    const newStatus = {
      ...existingStatus,
      ...update,
      lastUpdate: new Date()
    };

    this.agentStatuses.set(agentId, newStatus);

    // Broadcast update to all connected clients
    await this.broadcastAgentUpdate(agentId, newStatus);
  }

  async broadcastAgentUpdate(agentId: string, status: AgentStatus) {
    const message = {
      type: 'agent_status_update',
      agentId,
      status,
      timestamp: new Date().toISOString()
    };

    const disconnectedClients = new Set<WebSocket>();

    for (const client of this.connectedClients) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        disconnectedClients.add(client);
      }
    }

    // Clean up disconnected clients
    for (const client of disconnectedClients) {
      this.connectedClients.delete(client);
    }
  }

  async trackTaskProgress(agentId: string, taskId: string, progress: number) {
    const agentStatus = this.agentStatuses.get(agentId);
    if (!agentStatus || !agentStatus.currentTask) return;

    agentStatus.currentTask.progress = progress;
    agentStatus.currentTask.estimatedCompletion = this.calculateEstimatedCompletion(
      agentStatus.currentTask
    );

    await this.updateAgentStatus(agentId, {
      currentTask: agentStatus.currentTask
    });
  }

  private calculateEstimatedCompletion(task: TaskStatus): Date {
    const timeElapsed = Date.now() - task.id.length; // Simplified calculation
    const totalEstimatedTime = (timeElapsed / task.progress) * 100;
    const remainingTime = totalEstimatedTime - timeElapsed;
    return new Date(Date.now() + remainingTime);
  }
}
```

## 🔄 Live Code Collaboration

### Collaborative Code Editing
```javascript
// Real-time collaborative code editing with operational transformation
class CollaborativeCodeEditor {
  constructor(documentId) {
    this.documentId = documentId;
    this.document = new SharedDocument(documentId);
    this.operationalTransform = new OperationalTransform();
    this.cursors = new Map(); // User cursors
    this.selections = new Map(); // User selections
    this.websocket = new WebSocket(`ws://localhost:8080/document/${documentId}`);
    this.setupWebSocketHandlers();
  }

  setupWebSocketHandlers() {
    this.websocket.onopen = () => {
      // Request initial document state
      this.websocket.send(JSON.stringify({
        type: 'request_initial_state'
      }));
    };

    this.websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleServerMessage(message);
    };

    this.websocket.onclose = () => {
      // Attempt to reconnect
      setTimeout(() => {
        this.websocket = new WebSocket(`ws://localhost:8080/document/${this.documentId}`);
        this.setupWebSocketHandlers();
      }, 1000);
    };
  }

  handleServerMessage(message) {
    switch (message.type) {
      case 'initial_state':
        this.document.setState(message.content);
        this.renderDocument();
        break;

      case 'operation':
        this.applyOperation(message.operation, message.userId);
        break;

      case 'cursor_update':
        this.updateUserCursor(message.userId, message.cursor);
        break;

      case 'selection_update':
        this.updateUserSelection(message.userId, message.selection);
        break;

      case 'user_joined':
        this.handleUserJoined(message.user);
        break;

      case 'user_left':
        this.handleUserLeft(message.userId);
        break;
    }
  }

  insertText(position, text, userId) {
    const operation = {
      type: 'insert',
      position,
      text,
      userId,
      timestamp: Date.now()
    };

    // Apply locally first for responsiveness
    this.document.applyOperation(operation);
    this.renderDocument();

    // Send to server for synchronization
    this.websocket.send(JSON.stringify({
      type: 'operation',
      operation
    }));
  }

  deleteText(start, end, userId) {
    const operation = {
      type: 'delete',
      start,
      end,
      userId,
      timestamp: Date.now()
    };

    // Apply locally first
    this.document.applyOperation(operation);
    this.renderDocument();

    // Send to server
    this.websocket.send(JSON.stringify({
      type: 'operation',
      operation
    }));
  }

  applyOperation(operation, fromUserId) {
    // Don't apply operations that originated from this client
    if (fromUserId === this.userId) return;

    // Apply operational transformation to resolve conflicts
    const transformedOperation = this.operationalTransform.transform(
      operation,
      this.document.getPendingOperations()
    );

    this.document.applyOperation(transformedOperation);
    this.renderDocument();
  }

  updateCursor(position) {
    this.cursors.set(this.userId, position);

    // Broadcast cursor position to other users
    this.websocket.send(JSON.stringify({
      type: 'cursor_update',
      cursor: position
    }));

    this.renderUserCursors();
  }

  updateSelection(start, end) {
    this.selections.set(this.userId, { start, end });

    // Broadcast selection to other users
    this.websocket.send(JSON.stringify({
      type: 'selection_update',
      selection: { start, end }
    }));

    this.renderUserSelections();
  }

  renderDocument() {
    // Update the editor with current document state
    const content = this.document.getContent();
    this.editor.setValue(content);
  }

  renderUserCursors() {
    // Render cursors for all connected users
    for (const [userId, position] of this.cursors) {
      if (userId !== this.userId) {
        this.editor.renderUserCursor(userId, position);
      }
    }
  }

  renderUserSelections() {
    // Render selections for all connected users
    for (const [userId, selection] of this.selections) {
      if (userId !== this.userId) {
        this.editor.renderUserSelection(userId, selection);
      }
    }
  }
}
```

### Live Code Review
```typescript
// Real-time collaborative code review system
interface CodeReviewSession {
  id: string;
  pullRequestId: string;
  participants: ReviewParticipant[];
  comments: ReviewComment[];
  status: 'active' | 'completed' | 'cancelled';
  createdAt: Date;
}

interface ReviewComment {
  id: string;
  authorId: string;
  file: string;
  line: number;
  content: string;
  type: 'suggestion' | 'question' | 'issue' | 'praise';
  resolved: boolean;
  createdAt: Date;
  replies: CommentReply[];
}

class LiveCodeReviewSystem {
  private reviewSessions: Map<string, CodeReviewSession>;
  private websocketServer: WebSocketServer;
  private aiCodeAnalyzer: AICodeAnalyzer;

  constructor() {
    this.reviewSessions = new Map();
    this.aiCodeAnalyzer = new AICodeAnalyzer();
    this.setupWebSocketServer();
  }

  async startReviewSession(pullRequestId: string, participants: ReviewParticipant[]): Promise<string> {
    const sessionId = `review_${pullRequestId}_${Date.now()}`;

    const session: CodeReviewSession = {
      id: sessionId,
      pullRequestId,
      participants,
      comments: [],
      status: 'active',
      createdAt: new Date()
    };

    this.reviewSessions.set(sessionId, session);

    // Analyze code changes with AI
    const aiSuggestions = await this.aiCodeAnalyzer.analyzePullRequest(pullRequestId);

    // Add AI suggestions as initial comments
    for (const suggestion of aiSuggestions) {
      const comment: ReviewComment = {
        id: `ai_${Date.now()}_${Math.random()}`,
        authorId: 'ai_assistant',
        file: suggestion.file,
        line: suggestion.line,
        content: suggestion.suggestion,
        type: 'suggestion',
        resolved: false,
        createdAt: new Date(),
        replies: []
      };

      session.comments.push(comment);
    }

    // Notify participants
    await this.notifyParticipants(session, {
      type: 'review_session_started',
      sessionId,
      aiSuggestions: aiSuggestions.length
    });

    return sessionId;
  }

  async addComment(sessionId: string, comment: Omit<ReviewComment, 'id' | 'createdAt' | 'replies'>) {
    const session = this.reviewSessions.get(sessionId);
    if (!session) throw new Error('Review session not found');

    const fullComment: ReviewComment = {
      ...comment,
      id: `comment_${Date.now()}_${Math.random()}`,
      createdAt: new Date(),
      replies: []
    };

    session.comments.push(fullComment);

    // Broadcast to all participants
    await this.broadcastToSession(sessionId, {
      type: 'comment_added',
      comment: fullComment
    });

    // Trigger AI analysis of the comment context
    const aiResponse = await this.aiCodeAnalyzer.analyzeCommentContext(
      comment.file,
      comment.line,
      comment.content
    );

    if (aiResponse) {
      const aiComment: ReviewComment = {
        id: `ai_response_${Date.now()}`,
        authorId: 'ai_assistant',
        file: comment.file,
        line: comment.line,
        content: aiResponse,
        type: 'suggestion',
        resolved: false,
        createdAt: new Date(),
        replies: []
      };

      session.comments.push(aiComment);

      await this.broadcastToSession(sessionId, {
        type: 'ai_comment_added',
        comment: aiComment,
        inResponseTo: fullComment.id
      });
    }
  }

  async resolveComment(sessionId: string, commentId: string, userId: string) {
    const session = this.reviewSessions.get(sessionId);
    if (!session) throw new Error('Review session not found');

    const comment = session.comments.find(c => c.id === commentId);
    if (!comment) throw new Error('Comment not found');

    comment.resolved = true;

    await this.broadcastToSession(sessionId, {
      type: 'comment_resolved',
      commentId,
      resolvedBy: userId
    });
  }

  private async broadcastToSession(sessionId: string, message: any) {
    const session = this.reviewSessions.get(sessionId);
    if (!session) return;

    // Implementation would broadcast to WebSocket connections
    // for all participants in the session
  }
}

// Task orchestration for live code review
Task("Code Review Engineer", `
  Set up live code review system:
  - Implement real-time commenting and discussion threads
  - Set up AI-powered code analysis and suggestions
  - Configure live code highlighting and annotations
  - Implement real-time approval and merge workflows
  - Set up live code quality metrics and reporting
`, "code-review-specialist");

Task("Collaboration UX Engineer", `
  Build real-time collaboration interfaces:
  - Create live code review dashboards with real-time updates
  - Implement collaborative code annotation tools
  - Set up real-time notification and alert systems
  - Build live activity feeds for team coordination
  - Create shared workspace and project management tools
`, "frontend-dev");
```

## 📡 Real-Time Event Streaming

### Event-Driven Coordination
```python
# Real-time event streaming for agent coordination
import asyncio
import json
import redis
from typing import Dict, List, Any, Callable
from dataclasses import dataclass, asdict
from datetime import datetime

@dataclass
class CoordinationEvent:
    event_id: str
    event_type: str
    source_agent: str
    target_agents: List[str]
    payload: Dict[str, Any]
    timestamp: datetime
    correlation_id: str

class RealTimeEventStream:
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_client = redis.from_url(redis_url)
        self.pubsub = self.redis_client.pubsub()
        self.event_handlers: Dict[str, List[Callable]] = {}
        self.agent_subscriptions: Dict[str, List[str]] = {}

    async def publish_event(self, event: CoordinationEvent):
        """Publish an event to the coordination stream"""

        # Serialize event
        event_data = asdict(event)
        event_data['timestamp'] = event.timestamp.isoformat()

        # Publish to main coordination channel
        await self.redis_client.publish(
            'coordination:events',
            json.dumps(event_data)
        )

        # Publish to specific agent channels
        for target_agent in event.target_agents:
            await self.redis_client.publish(
                f'agent:{target_agent}:events',
                json.dumps(event_data)
            )

        # Publish to event type specific channels
        await self.redis_client.publish(
            f'events:{event.event_type}',
            json.dumps(event_data)
        )

    async def subscribe_to_events(self, agent_id: str, event_types: List[str] = None):
        """Subscribe an agent to coordination events"""

        # Subscribe to agent-specific channel
        await self.pubsub.subscribe(f'agent:{agent_id}:events')

        # Subscribe to specific event types if provided
        if event_types:
            for event_type in event_types:
                await self.pubsub.subscribe(f'events:{event_type}')
        else:
            # Subscribe to all events
            await self.pubsub.subscribe('coordination:events')

        # Start listening for events
        await self._start_event_listener(agent_id)

    async def _start_event_listener(self, agent_id: str):
        """Start listening for events and dispatch to handlers"""

        async for message in self.pubsub.listen():
            if message['type'] == 'message':
                try:
                    event_data = json.loads(message['data'])
                    event = CoordinationEvent(
                        event_id=event_data['event_id'],
                        event_type=event_data['event_type'],
                        source_agent=event_data['source_agent'],
                        target_agents=event_data['target_agents'],
                        payload=event_data['payload'],
                        timestamp=datetime.fromisoformat(event_data['timestamp']),
                        correlation_id=event_data['correlation_id']
                    )

                    # Dispatch to registered handlers
                    await self._dispatch_event(agent_id, event)

                except Exception as e:
                    print(f"Error processing event: {e}")

    async def _dispatch_event(self, agent_id: str, event: CoordinationEvent):
        """Dispatch event to registered handlers"""

        # Check if this agent is a target
        if agent_id not in event.target_agents and event.target_agents != ['*']:
            return

        # Get handlers for this event type
        handlers = self.event_handlers.get(event.event_type, [])

        # Execute all handlers concurrently
        if handlers:
            await asyncio.gather(
                *[handler(event) for handler in handlers],
                return_exceptions=True
            )

    def register_event_handler(self, event_type: str, handler: Callable):
        """Register a handler for a specific event type"""
        if event_type not in self.event_handlers:
            self.event_handlers[event_type] = []
        self.event_handlers[event_type].append(handler)

# Example event coordination implementation
class AgentCoordinationManager:
    def __init__(self):
        self.event_stream = RealTimeEventStream()
        self.agent_states = {}
        self.task_assignments = {}

        # Register event handlers
        self.setup_event_handlers()

    def setup_event_handlers(self):
        """Set up event handlers for coordination"""

        self.event_stream.register_event_handler(
            'task_started',
            self.handle_task_started
        )

        self.event_stream.register_event_handler(
            'task_completed',
            self.handle_task_completed
        )

        self.event_stream.register_event_handler(
            'resource_request',
            self.handle_resource_request
        )

        self.event_stream.register_event_handler(
            'agent_status_update',
            self.handle_agent_status_update
        )

    async def handle_task_started(self, event: CoordinationEvent):
        """Handle task started events"""
        task_id = event.payload['task_id']
        agent_id = event.source_agent

        # Update task assignments
        self.task_assignments[task_id] = {
            'agent_id': agent_id,
            'started_at': event.timestamp,
            'status': 'in_progress'
        }

        # Notify other agents about task assignment
        await self.event_stream.publish_event(CoordinationEvent(
            event_id=f"task_assigned_{task_id}",
            event_type='task_assigned',
            source_agent='coordination_manager',
            target_agents=['*'],
            payload={
                'task_id': task_id,
                'assigned_to': agent_id,
                'estimated_duration': event.payload.get('estimated_duration')
            },
            timestamp=datetime.now(),
            correlation_id=event.correlation_id
        ))

    async def handle_resource_request(self, event: CoordinationEvent):
        """Handle resource requests from agents"""
        requested_resources = event.payload['resources']
        requesting_agent = event.source_agent

        # Check resource availability
        available_resources = await self.check_resource_availability(requested_resources)

        # Respond with resource allocation
        await self.event_stream.publish_event(CoordinationEvent(
            event_id=f"resource_response_{event.event_id}",
            event_type='resource_allocation',
            source_agent='coordination_manager',
            target_agents=[requesting_agent],
            payload={
                'requested': requested_resources,
                'allocated': available_resources,
                'request_id': event.event_id
            },
            timestamp=datetime.now(),
            correlation_id=event.correlation_id
        ))
```

## 🔗 Related Documentation

- [Enterprise Integration Patterns](../enterprise-integration/README.md)
- [Multi-Cloud Deployment](../multi-cloud/README.md)
- [Workflow Automation](../workflow-automation/README.md)
- [Performance Optimization](../performance-optimization/README.md)
- [Troubleshooting Guide](../troubleshooting/README.md)

---

**Real-Time Collaboration Success Factors:**
1. Low-latency WebSocket communication
2. Operational transformation for conflict resolution
3. Presence awareness and user coordination
4. Real-time state synchronization
5. Event-driven architecture with proper ordering
6. Intelligent notification and alert systems