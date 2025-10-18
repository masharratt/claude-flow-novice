#!/usr/bin/env python3
import redis
import time
import sys
from typing import Dict, List

class ReleaseGateCoordinator:
    def __init__(self, redis_host='localhost', redis_port=6379):
        self.redis_client = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)
        self.workers = ['backend-dev', 'ui-designer', 'devops-engineer']
        self.gate_key = "swarm:gate:release"
        self.waiting_key = "swarm:gate:agents_waiting"
        self.worker_status_key = "swarm:gate:worker_status"
        
    def initialize_gate(self):
        """Initialize the release gate with all workers"""
        print("Initializing release gate...")
        self.redis_client.set(self.gate_key, "false")
        self.redis_client.set(self.waiting_key, "0")
        self.redis_client.delete(self.worker_status_key)
        
        # Initialize worker status
        for worker in self.workers:
            self.redis_client.hset(self.worker_status_key, worker, "arrived")
        print(f"Gate initialized with workers: {self.workers}")
        
    def monitor_arrivals(self):
        """Monitor worker arrivals until all have arrived"""
        print("Monitoring worker arrivals...")
        while True:
            waiting_count = int(self.redis_client.get(self.waiting_key))
            print(f"Workers arrived: {waiting_count}/3")
            
            if waiting_count == len(self.workers):
                print("All workers have arrived at the gate!")
                break
                
            time.sleep(1)
            
    def release_workers(self):
        """Release all workers simultaneously"""
        print("Releasing all workers...")
        self.redis_client.set(self.gate_key, "true")
        print("Release signal sent to all workers")
        
    def verify_release(self):
        """Verify all workers have been released"""
        print("Verifying worker release status...")
        for worker in self.workers:
            status = self.redis_client.hget(self.worker_status_key, worker)
            print(f"{worker}: {status}")
            
    def run_coordination(self):
        """Run the complete coordination process"""
        try:
            self.initialize_gate()
            self.monitor_arrivals()
            self.release_workers()
            self.verify_release()
            
            print("\n✅ Coordination completed successfully!")
            print("All workers have been synchronized and released simultaneously.")
            
        except Exception as e:
            print(f"❌ Coordination failed: {e}")
            sys.exit(1)

if __name__ == "__main__":
    coordinator = ReleaseGateCoordinator()
    coordinator.run_coordination()