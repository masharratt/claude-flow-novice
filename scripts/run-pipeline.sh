#!/bin/bash
node config/hooks/post-edit-pipeline.js "$1" --memory-key "$2"