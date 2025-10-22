#!/bin/bash

# Cleanup script for web portal development

# Find and kill any existing processes on required ports
cleanup_ports() {
    echo "Cleaning up existing processes..."
    for port in 3001 3002 3003 8080; do
        pid=$(lsof -t -i:$port)
        if [ ! -z "$pid" ]; then
            echo "Killing process on port $port (PID: $pid)"
            kill -9 $pid
        fi
    done
    sleep 2
}

# Check if ports are now clear
check_ports() {
    echo "Verifying ports are clear..."
    ports=(3001 8080)
    for port in "${ports[@]}"; do
        if lsof -i:$port > /dev/null; then
            echo "Error: Port $port is still in use!"
            exit 1
        fi
    done
}

# Start Vite client
start_client() {
    echo "Starting Vite client on port 3001..."
    npm run dev:client &
    client_pid=$!
}

# Start Express server
start_server() {
    echo "Starting Express server on port 8080..."
    npm run dev:server &
    server_pid=$!
}

# Health check for services
health_check() {
    echo "Performing health checks..."

    # Wait for client to start
    timeout=30
    while ! curl -s http://localhost:3001 > /dev/null; do
        echo "Waiting for Vite client to start..."
        sleep 2
        ((timeout-=2))
        if [ $timeout -le 0 ]; then
            echo "Error: Vite client failed to start"
            exit 1
        fi
    done

    # Wait for server to start
    timeout=30
    while ! curl -s http://localhost:8080/health > /dev/null; do
        echo "Waiting for server to start..."
        sleep 2
        ((timeout-=2))
        if [ $timeout -le 0 ]; then
            echo "Error: Server failed to start"
            exit 1
        fi
    done

    echo "✅ All services started successfully!"
}

# Graceful shutdown
shutdown() {
    echo "Shutting down services..."
    kill -9 $client_pid $server_pid 2>/dev/null
    wait
    exit 0
}

# Trap signals for graceful shutdown
trap shutdown SIGINT SIGTERM

# Main execution flow
cleanup_ports
check_ports
start_client
start_server
health_check

# Keep script running
wait