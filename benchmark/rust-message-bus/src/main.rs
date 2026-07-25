/*!
 * Test 2: Rust WebSocket Message Bus
 *
 * Simulates a message routing system for persistent agents communicating like Slack.
 * Measures: throughput, latency, memory usage at various connection counts.
 *
 * Usage: cargo run --release -- --port 8081
 */

use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::{IntoResponse, Json},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::RwLock;
use tracing::{error, info};

// Shared application state
#[derive(Clone)]
struct AppState {
    agents: Arc<RwLock<HashMap<String, tokio::sync::mpsc::UnboundedSender<String>>>>,
    stats: Arc<Stats>,
}

// Statistics tracking
struct Stats {
    total_connections: AtomicU64,
    active_connections: AtomicU64,
    messages_routed: AtomicU64,
    messages_failed: AtomicU64,
    start_time: u64,
    latencies: Arc<RwLock<Vec<u64>>>,
}

// Incoming message format
#[derive(Debug, Deserialize)]
struct IncomingMessage {
    to: String,
    from: String,
    payload: serde_json::Value,
    #[serde(default)]
    sent_at: Option<u64>,
    #[serde(default)]
    id: Option<String>,
}

// Routed message format
#[derive(Debug, Serialize)]
struct RoutedMessage {
    to: String,
    from: String,
    payload: serde_json::Value,
    sent_at: Option<u64>,
    id: Option<String>,
    routed_at: u64,
    routed_by: String,
}

// Acknowledgment message
#[derive(Debug, Serialize)]
struct AckMessage {
    ack: bool,
    message_id: Option<String>,
    routed_at: u64,
}

// Error response
#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    target: Option<String>,
}

// Metrics response
#[derive(Debug, Serialize)]
struct MetricsResponse {
    uptime_seconds: u64,
    total_connections: u64,
    active_connections: u64,
    messages_routed: u64,
    messages_failed: u64,
    throughput_msg_per_sec: f64,
    memory_mb: MemoryMetrics,
    latency_p50: u64,
    latency_p95: u64,
    latency_p99: u64,
}

#[derive(Debug, Serialize)]
struct MemoryMetrics {
    rss: u64,
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Parse command line arguments
    let port: u16 = std::env::args()
        .position(|arg| arg == "--port")
        .and_then(|i| std::env::args().nth(i + 1))
        .and_then(|p| p.parse().ok())
        .unwrap_or(8081);

    // Initialize application state
    let state = AppState {
        agents: Arc::new(RwLock::new(HashMap::new())),
        stats: Arc::new(Stats {
            total_connections: AtomicU64::new(0),
            active_connections: AtomicU64::new(0),
            messages_routed: AtomicU64::new(0),
            messages_failed: AtomicU64::new(0),
            start_time: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            latencies: Arc::new(RwLock::new(Vec::new())),
        }),
    };

    // Start periodic stats logging
    let stats_clone = state.stats.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
        loop {
            interval.tick().await;
            let active = stats_clone.active_connections.load(Ordering::Relaxed);
            let routed = stats_clone.messages_routed.load(Ordering::Relaxed);
            let failed = stats_clone.messages_failed.load(Ordering::Relaxed);

            // Get memory usage (Linux-only via procfs)
            #[cfg(target_os = "linux")]
            let mem_mb = {
                let mem_kb = procfs::process::Process::myself()
                    .ok()
                    .and_then(|p| p.stat().ok())
                    .map(|stat| stat.rss * 4) // RSS is in pages, typically 4KB
                    .unwrap_or(0);
                mem_kb / 1024
            };

            #[cfg(not(target_os = "linux"))]
            let mem_mb = 0;

            info!(
                "Active: {} | Routed: {} | Failed: {} | Mem: {}MB",
                active, routed, failed, mem_mb
            );
        }
    });

    // Build router
    let app = Router::new()
        .route("/ws/:agent_id", get(ws_handler))
        .route("/metrics", get(metrics_handler))
        .route("/health", get(health_handler))
        .with_state(state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Rust Message Bus running on http://{}", addr);
    info!("WebSocket: ws://{}/ws/{{agent_id}}", addr);
    info!("Metrics: http://{}/metrics", addr);
    info!("Health: http://{}/health", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// WebSocket handler
async fn ws_handler(
    ws: WebSocketUpgrade,
    axum::extract::Path(agent_id): axum::extract::Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, agent_id, state))
}

// Handle WebSocket connection
async fn handle_socket(socket: WebSocket, agent_id: String, state: AppState) {
    let (mut sender, mut receiver) = socket.split();

    // Create channel for this agent
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // Register agent
    state.agents.write().await.insert(agent_id.clone(), tx);
    state.stats.total_connections.fetch_add(1, Ordering::Relaxed);
    state
        .stats
        .active_connections
        .fetch_add(1, Ordering::Relaxed);

    info!(
        "CONNECT: {} | Active: {}",
        agent_id,
        state.stats.active_connections.load(Ordering::Relaxed)
    );

    // Send welcome message
    let welcome = serde_json::json!({
        "type": "welcome",
        "agent_id": agent_id,
        "timestamp": current_timestamp()
    });
    let _ = sender.send(Message::Text(welcome.to_string())).await;

    // Spawn task to send messages to this agent
    let agent_id_clone = agent_id.clone();
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages
    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let receive_time = current_timestamp();

                match serde_json::from_str::<IncomingMessage>(&text) {
                    Ok(incoming) => {
                        // Route message to target agent
                        let agents = state.agents.read().await;
                        if let Some(target_tx) = agents.get(&incoming.to) {
                            // Create routed message
                            let routed = RoutedMessage {
                                to: incoming.to.clone(),
                                from: incoming.from,
                                payload: incoming.payload,
                                sent_at: incoming.sent_at,
                                id: incoming.id.clone(),
                                routed_at: receive_time,
                                routed_by: "message-bus".to_string(),
                            };

                            if target_tx
                                .send(serde_json::to_string(&routed).unwrap())
                                .is_ok()
                            {
                                state
                                    .stats
                                    .messages_routed
                                    .fetch_add(1, Ordering::Relaxed);

                                // Track latency
                                if let Some(sent_at) = incoming.sent_at {
                                    let latency = receive_time.saturating_sub(sent_at);
                                    let mut latencies = state.stats.latencies.write().await;
                                    latencies.push(latency);

                                    // Keep only last 10k latencies
                                    if latencies.len() > 10000 {
                                        latencies.remove(0);
                                    }
                                }

                                // Send acknowledgment
                                let ack = AckMessage {
                                    ack: true,
                                    message_id: incoming.id,
                                    routed_at: receive_time,
                                };

                                if let Ok(ack_json) = serde_json::to_string(&ack) {
                                    if let Some(sender_tx) = agents.get(&agent_id) {
                                        let _ = sender_tx.send(ack_json);
                                    }
                                }
                            } else {
                                state
                                    .stats
                                    .messages_failed
                                    .fetch_add(1, Ordering::Relaxed);
                            }
                        } else {
                            // Target agent not found
                            state
                                .stats
                                .messages_failed
                                .fetch_add(1, Ordering::Relaxed);

                            let error = ErrorResponse {
                                error: "Agent not found or disconnected".to_string(),
                                target: Some(incoming.to),
                            };

                            if let Ok(error_json) = serde_json::to_string(&error) {
                                let agents = state.agents.read().await;
                                if let Some(sender_tx) = agents.get(&agent_id) {
                                    let _ = sender_tx.send(error_json);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        state
                            .stats
                            .messages_failed
                            .fetch_add(1, Ordering::Relaxed);
                        error!("Failed to parse message: {}", e);

                        let error = ErrorResponse {
                            error: "Failed to process message".to_string(),
                            target: None,
                        };

                        if let Ok(error_json) = serde_json::to_string(&error) {
                            let agents = state.agents.read().await;
                            if let Some(sender_tx) = agents.get(&agent_id) {
                                let _ = sender_tx.send(error_json);
                            }
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Err(e) => {
                error!("WebSocket error for {}: {}", agent_id, e);
                break;
            }
            _ => {}
        }
    }

    // Cleanup on disconnect
    state.agents.write().await.remove(&agent_id);
    state
        .stats
        .active_connections
        .fetch_sub(1, Ordering::Relaxed);

    info!(
        "DISCONNECT: {} | Active: {}",
        agent_id,
        state.stats.active_connections.load(Ordering::Relaxed)
    );
}

// Metrics endpoint
async fn metrics_handler(State(state): State<AppState>) -> Json<MetricsResponse> {
    let uptime = current_timestamp() - state.stats.start_time;
    let total = state.stats.total_connections.load(Ordering::Relaxed);
    let active = state.stats.active_connections.load(Ordering::Relaxed);
    let routed = state.stats.messages_routed.load(Ordering::Relaxed);
    let failed = state.stats.messages_failed.load(Ordering::Relaxed);

    let latencies = state.stats.latencies.read().await;
    let (p50, p95, p99) = calculate_percentiles(&latencies);

    // Get memory usage (Linux-only via procfs)
    #[cfg(target_os = "linux")]
    let rss_mb = procfs::process::Process::myself()
        .ok()
        .and_then(|p| p.stat().ok())
        .map(|stat| (stat.rss * 4) / 1024) // RSS in MB
        .unwrap_or(0);

    // Non-Linux platforms: memory reporting not available
    #[cfg(not(target_os = "linux"))]
    let rss_mb = 0;

    Json(MetricsResponse {
        uptime_seconds: uptime,
        total_connections: total,
        active_connections: active,
        messages_routed: routed,
        messages_failed: failed,
        throughput_msg_per_sec: if uptime > 0 {
            routed as f64 / uptime as f64
        } else {
            0.0
        },
        memory_mb: MemoryMetrics { rss: rss_mb },
        latency_p50: p50,
        latency_p95: p95,
        latency_p99: p99,
    })
}

// Health check endpoint
async fn health_handler() -> &'static str {
    "OK"
}

// Utility: Get current timestamp in seconds
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

// Utility: Calculate percentiles
fn calculate_percentiles(data: &[u64]) -> (u64, u64, u64) {
    if data.is_empty() {
        return (0, 0, 0);
    }

    let mut sorted = data.to_vec();
    sorted.sort_unstable();

    let p50_idx = (sorted.len() as f64 * 0.50).ceil() as usize - 1;
    let p95_idx = (sorted.len() as f64 * 0.95).ceil() as usize - 1;
    let p99_idx = (sorted.len() as f64 * 0.99).ceil() as usize - 1;

    (
        sorted.get(p50_idx).copied().unwrap_or(0),
        sorted.get(p95_idx).copied().unwrap_or(0),
        sorted.get(p99_idx).copied().unwrap_or(0),
    )
}
