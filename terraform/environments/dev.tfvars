# Development Environment Configuration

# Basic Configuration
project_name = "claude-flow-novice"
environment = "dev"
aws_region = "us-east-1"

# Networking
vpc_cidr = "10.0.0.0/16"
public_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.11.0/24", "10.0.12.0/24"]
database_subnet_cidrs = ["10.0.21.0/24", "10.0.22.0/24"]
enable_nat_gateway = true
enable_vpn_gateway = false

# Auto Scaling
instance_type = "t3.micro"
desired_capacity = 1
min_size = 1
max_size = 3
enable_monitoring = false

# Load Balancer
alb_internal = false
alb_enable_deletion_protection = false
alb_enable_https = false
alb_enable_access_logs = false

# Application
app_port = 3000
health_check_port = 3000
health_check_path = "/health"

# Monitoring
enable_metric_streams = false
log_retention_days = 7
security_log_retention_days = 30

# Security
allowed_ssh_ips = ["0.0.0.0/0"] # Dev environment - open for testing

# Disaster Recovery
enable_disaster_recovery = false
enable_rds_replication = false
enable_auto_failover = false

# Scaling
enable_scheduled_scaling = false
enable_lifecycle_hooks = false

# Notifications
notification_email = ""
slack_webhook_url = ""

# Domain
domain_name = "dev.claude-flow-novice.com"
route53_zone_id = ""