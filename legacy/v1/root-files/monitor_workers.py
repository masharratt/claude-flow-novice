#!/usr/bin/env python3
import redis
import time
import json
from datetime import datetime, timedelta

class WorkerCoordinator:
    def __init__(self):
        self.redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)
        self.workers = ['architect', 'coder', 'tester']
        
    def check_worker_status(self):
        """Check status of all workers"""
        statuses = {}
        for worker in self.workers:
            status = self.redis_client.get(f"swarm:collab:{worker}:status")
            statuses[worker] = status if status else "unknown"
        return statuses
    
    def wait_for_completion(self, timeout=60):
        """Wait for all workers to complete their primary work"""
        start_time = datetime.now()
        print(f"Starting worker monitoring at {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        
        while (datetime.now() - start_time).seconds < timeout:
            statuses = self.check_worker_status()
            print(f"Worker statuses: {statuses}")
            
            # Check if all workers are complete
            all_complete = all(status == "complete" for status in statuses.values())
            
            if all_complete:
                print("All workers have completed their primary work!")
                return True
                
            time.sleep(2)  # Check every 2 seconds
        
        print(f"Timeout reached after {timeout} seconds")
        return False
    
    def start_qa_phase(self, timeout=60):
        """Start Q&A phase for 60 seconds"""
        print("Starting Q&A phase...")
        self.redis_client.set("swarm:collab:qa_active", "true")
        self.redis_client.expire("swarm:collab:qa_active", timeout)
        
        start_time = datetime.now()
        while (datetime.now() - start_time).seconds < timeout:
            qa_active = self.redis_client.get("swarm:collab:qa_active")
            if qa_active == "false":
                print("Q&A phase completed early")
                break
            time.sleep(1)
        
        print("Q&A phase completed")
        return True
    
    def graceful_shutdown(self):
        """Initiate graceful shutdown"""
        print("Initiating graceful shutdown...")
        self.redis_client.set("swarm:collab:all_done", "true")
        
        # Verify all workers exit
        start_time = datetime.now()
        while (datetime.now() - start_time).seconds < 30:
            statuses = self.check_worker_status()
            print(f"Worker statuses during shutdown: {statuses}")
            
            all_complete = all(status == "complete" for status in statuses.values())
            if all_complete:
                print("All workers have gracefully shutdown")
                return True
            
            time.sleep(2)
        
        print("Graceful shutdown verification timeout")
        return False
    
    def run_coordination(self):
        """Main coordination loop"""
        print("=== Worker Coordination Starting ===")
        
        # Phase 1: Wait for all workers to complete primary work
        if not self.wait_for_completion():
            print("Warning: Not all workers completed within timeout")
        
        # Phase 2: Q&A Phase
        self.start_qa_phase()
        
        # Phase 3: Graceful shutdown
        self.graceful_shutdown()
        
        print("=== Coordination Complete ===")

if __name__ == "__main__":
    coordinator = WorkerCoordinator()
    coordinator.run_coordination()