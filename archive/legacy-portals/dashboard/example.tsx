/**
 * Fleet Dashboard Usage Examples
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  FleetDashboard,
  FleetOverview,
  SwarmVisualization,
  PerformanceChart,
  AlertsPanel,
  useFleetDashboard,
  FleetDashboardClient
} from './components';
import './components/dashboard.css';

// ===== Example 1: Complete Dashboard =====
export function Example1_CompleteDashboard() {
  return (
    <FleetDashboard
      config={{
        serverUrl: 'http://localhost:3001',
        refreshInterval: 1000,
        autoReconnect: true,
        debug: true
      }}
      layout="grid"
      autoConnect={true}
      showChart={true}
      showAlerts={true}
    />
  );
}

// ===== Example 2: Custom Dashboard Layout =====
export function Example2_CustomLayout() {
  const { client, connectionStatus, latestMetrics } = useFleetDashboard({
    serverUrl: 'http://localhost:3001',
    refreshInterval: 1000
  });

  return (
    <div className="custom-dashboard">
      <header>
        <h1>Fleet Monitor</h1>
        <div className={`status ${connectionStatus}`}>
          Status: {connectionStatus}
        </div>
      </header>

      <div className="dashboard-grid">
        <div className="left-column">
          <FleetOverview client={client} detailed={true} />
          <SwarmVisualization client={client} maxSwarms={5} activeOnly={true} />
        </div>

        <div className="right-column">
          <PerformanceChart
            client={client}
            height={400}
            timeWindow={120}
            metrics={['cpu', 'memory', 'network']}
          />
          <AlertsPanel client={client} maxAlerts={15} filterSeverity="warning" />
        </div>
      </div>
    </div>
  );
}

// ===== Example 3: Standalone Widgets =====
export function Example3_StandaloneWidgets() {
  const { client } = useFleetDashboard();

  return (
    <div>
      {/* Just the overview */}
      <FleetOverview client={client} />

      {/* Just the swarms */}
      <SwarmVisualization client={client} maxSwarms={10} />

      {/* Just the chart */}
      <PerformanceChart client={client} height={300} metrics={['cpu', 'memory']} />
    </div>
  );
}

// ===== Example 4: Client-Only Integration =====
export function Example4_ClientOnly() {
  const [metrics, setMetrics] = React.useState<any>(null);
  const [alerts, setAlerts] = React.useState<any[]>([]);

  React.useEffect(() => {
    // Create client manually
    const client = new FleetDashboardClient({
      serverUrl: 'http://localhost:3001',
      refreshInterval: 1000,
      debug: true
    });

    // Connect
    client.connect();

    // Listen for metrics
    client.on('metrics', (data) => {
      setMetrics(data);
      console.log('Metrics:', data);
    });

    // Listen for alerts
    client.on('alert', (alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 10));
      console.log('Alert:', alert);
    });

    // Cleanup
    return () => {
      client.disconnect();
    };
  }, []);

  return (
    <div>
      <h2>Raw Metrics</h2>
      <pre>{JSON.stringify(metrics, null, 2)}</pre>

      <h2>Alerts</h2>
      <ul>
        {alerts.map((alert, i) => (
          <li key={i}>
            {alert.severity}: {alert.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ===== Example 5: With Authentication =====
export function Example5_WithAuth() {
  const [authToken, setAuthToken] = React.useState('');
  const [client, setClient] = React.useState<FleetDashboardClient | null>(null);

  const handleLogin = () => {
    // Create authenticated client
    const newClient = new FleetDashboardClient({
      serverUrl: 'http://localhost:3001',
      authToken,
      refreshInterval: 1000
    });

    newClient.connect().then(() => {
      setClient(newClient);
    }).catch(err => {
      alert(`Login failed: ${err.message}`);
    });
  };

  if (!client) {
    return (
      <div className="login-form">
        <h2>Login</h2>
        <input
          type="password"
          placeholder="Auth Token"
          value={authToken}
          onChange={(e) => setAuthToken(e.target.value)}
        />
        <button onClick={handleLogin}>Connect</button>
      </div>
    );
  }

  return (
    <FleetDashboard client={client} layout="grid" autoConnect={false} />
  );
}

// ===== Example 6: Embedded in Larger App =====
export function Example6_EmbeddedDashboard() {
  const [showDashboard, setShowDashboard] = React.useState(false);

  return (
    <div className="app">
      <nav>
        <button onClick={() => setShowDashboard(!showDashboard)}>
          Toggle Fleet Monitor
        </button>
      </nav>

      {showDashboard && (
        <aside className="dashboard-sidebar">
          <FleetDashboard
            config={{ refreshInterval: 2000 }}
            layout="vertical"
            showChart={false}
          />
        </aside>
      )}

      <main>
        {/* Your main application content */}
        <h1>Main Application</h1>
      </main>
    </div>
  );
}

// ===== Demo Launcher =====
export function DemoApp() {
  const [example, setExample] = React.useState(1);

  const examples = [
    { id: 1, name: 'Complete Dashboard', component: Example1_CompleteDashboard },
    { id: 2, name: 'Custom Layout', component: Example2_CustomLayout },
    { id: 3, name: 'Standalone Widgets', component: Example3_StandaloneWidgets },
    { id: 4, name: 'Client Only', component: Example4_ClientOnly },
    { id: 5, name: 'With Authentication', component: Example5_WithAuth },
    { id: 6, name: 'Embedded Dashboard', component: Example6_EmbeddedDashboard }
  ];

  const CurrentExample = examples.find(e => e.id === example)?.component || Example1_CompleteDashboard;

  return (
    <div className="demo-app">
      <div className="example-selector">
        <h2>Examples</h2>
        {examples.map(ex => (
          <button
            key={ex.id}
            className={example === ex.id ? 'active' : ''}
            onClick={() => setExample(ex.id)}
          >
            {ex.name}
          </button>
        ))}
      </div>

      <div className="example-content">
        <CurrentExample />
      </div>
    </div>
  );
}

// ===== Mount Demo =====
if (typeof window !== 'undefined') {
  const root = document.getElementById('root');
  if (root) {
    ReactDOM.createRoot(root).render(<DemoApp />);
  }
}
