#!/usr/bin/env python3
import redis
import time
import random
import argparse
from datetime import datetime

class Worker:
    def __init__(self, worker_type):
        self.redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)
        self.worker_type = worker_type
        self.status_key = f"swarm:collab:{worker_type}:status"
        
    def update_status(self, status):
        """Update worker status in Redis"""
        self.redis_client.set(self.status_key, status)
        print(f"{self.worker_type}: Status updated to {status}")
    
    def simulate_work(self):
        """Simulate worker doing its primary work"""
        print(f"{self.worker_type}: Starting work...")
        self.update_status("working")
        
        # Simulate work duration
        work_time = random.randint(3, 12)
        time.sleep(work_time)
        
        print(f"{self.worker_type}: Work completed in {work_time} seconds")
        self.update_status("complete")
        
        # Simulate some Q&A activity
        qa_active = self.redis_client.get("swarm:collab:qa_active")
        if qa_active == "true":
            print(f"{self.worker_type}: Participating in Q&A phase...")
            time.sleep(random.randint(2, 5))
            print(f"{self.worker_type}: Q&A completed")
        
        # Check if shutdown is initiated
        all_done = self.redis_client.get("swarm:collab:all_done")
        if all_done == "true":
            print(f"{self.worker_type}: Shutdown signal received, exiting...")
        else:
            print(f"{self.worker_type}: Waiting for shutdown signal...")
            time.sleep(5)

def main():
    parser = argparse.ArgumentParser(description='Simulate a worker')
    parser.add_argument('worker_type', choices=['architect', 'coder', 'tester'], 
                       help='Type of worker to simulate')
    
    args = parser.parse_args()
    
    print(f"=== Starting {args.worker_type} worker ===")
    worker = Worker(args.worker_type)
    
    try:
        worker.simulate_work()
    except KeyboardInterrupt:
        print(f"{args.worker_type}: Worker interrupted")
    finally:
        print(f"=== {args.worker_type} worker finished ===")

if __name__ == "__main__":
    main()