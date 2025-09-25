// Simple server for testing the web portal
import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files from web frontend
app.use(express.static(path.join(__dirname, 'src/web/frontend/public')));

// Basic API endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the main app
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Claude Flow Personal - Web Portal</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 40px;
                background: #f5f5f5;
            }
            .container {
                max-width: 800px;
                margin: 0 auto;
                background: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 { color: #2563eb; }
            .status-dot {
                display: inline-block;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                margin-right: 8px;
            }
            .connected { background: #10b981; }
            .disconnected { background: #ef4444; }
            .view-selector { margin: 20px 0; }
            .view-content {
                padding: 20px;
                border: 1px solid #e5e5e5;
                border-radius: 8px;
                margin: 20px 0;
                min-height: 200px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Claude Flow Personal</h1>
            <div data-testid="connection-status" class="connection-status">
                <span class="status-dot connected"></span>
                Connected
            </div>

            <div data-testid="view-selector" class="view-selector">
                <label for="view-select">View:</label>
                <select id="view-select">
                    <option value="dashboard">Dashboard</option>
                    <option value="messages">Messages</option>
                    <option value="agents">Agents</option>
                    <option value="transparency">Transparency</option>
                    <option value="mcp">MCP Integration</option>
                </select>
            </div>

            <div data-testid="swarm-dashboard" class="view-content">
                <h2>Swarm Dashboard</h2>
                <p>Web portal is running successfully!</p>
                <p>Ready for agent messaging, transparency monitoring, and MCP integration.</p>
            </div>

            <div data-testid="messages-view" class="view-content" style="display: none;">
                <h2>Agent Messages</h2>
                <p>Real-time agent message display would appear here.</p>
            </div>

            <div data-testid="agents-view" class="view-content" style="display: none;">
                <h2>Agent Management</h2>
                <p>Agent status and control panel would appear here.</p>
            </div>

            <div data-testid="transparency-view" class="view-content" style="display: none;">
                <h2>Transparency Insights</h2>
                <p>Agent decision logging and transparency data would appear here.</p>
            </div>

            <div data-testid="mcp-integration-panel" class="view-content" style="display: none;">
                <h2>MCP Integration Control</h2>
                <div class="mcp-systems">
                    <h3>Available MCP Systems:</h3>
                    <label><input type="radio" name="mcp-system" value="claude-flow" checked> Claude Flow MCP</label><br>
                    <label><input type="radio" name="mcp-system" value="ruv-swarm"> ruv-swarm MCP</label><br>
                    <label><input type="radio" name="mcp-system" value="playwright"> Playwright MCP</label>
                </div>

                <div data-testid="category-selector" style="margin: 20px 0;">
                    <label for="category-select">Category:</label>
                    <select id="category-select">
                        <option value="all">All Commands</option>
                        <option value="swarm">Swarm Management</option>
                        <option value="agent">Agent Control</option>
                        <option value="task">Task Orchestration</option>
                        <option value="neural">Neural Networks</option>
                        <option value="system">System Operations</option>
                        <option value="testing">Testing & QA</option>
                    </select>
                </div>
            </div>
        </div>

        <script>
            // Simple view switching
            const viewSelect = document.getElementById('view-select');
            const viewContents = document.querySelectorAll('.view-content');

            viewSelect.addEventListener('change', function() {
                viewContents.forEach(content => {
                    content.style.display = 'none';
                });

                const selectedView = document.querySelector('[data-testid="' + this.value + '-view"], [data-testid="' + this.value + '"], [data-testid="' + this.value + '-panel"]');
                if (selectedView) {
                    selectedView.style.display = 'block';
                }
            });

            // WebSocket connection for testing
            const socket = io();
            socket.on('connect', () => {
                console.log('Connected to WebSocket server');
            });
        </script>
    </body>
    </html>
  `);
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected');

  socket.emit('connection-status', { connected: true });

  socket.on('mcp-command', (data) => {
    console.log('Received MCP command:', data);
    // Echo back for testing
    socket.emit('mcp-response', {
      success: true,
      command: data.command,
      system: data.system,
      result: { status: 'executed', timestamp: new Date().toISOString() }
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Web portal server running on http://localhost:${PORT}`);
});

export { app, server, io };