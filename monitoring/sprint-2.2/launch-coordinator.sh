#!/bin/bash

# Launch engineering coordinator
docker-compose -f engineering-coordinator.yml up -d

# Wait for initialization
sleep 30

# Check status
docker-compose -f engineering-coordinator.yml ps