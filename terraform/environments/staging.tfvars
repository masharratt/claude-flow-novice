# Staging Environment Configuration

# Basic Configuration
project_name = "claude-flow-novice"
environment = "staging"
aws_region = "us-east-1"

# Networking
vpc_cidr = "10.0.0.0/16"
public_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.11.0/24", "10.0.12.0/24"]
database_subnet_cidrs = ["10.0.21.0/24", "10.0.22.0/24"]
enable_nat_gateway = true
enable_vpn_gateway = false

# Auto Scaling
instance_type = "t3.small"
desired_capacity = 2
min_size = 1
max_size = 4
enable_monitoring = true

# Load Balancer
alb_internal = false
alb_enable_deletion_protection = false
alb_enable_https = true
alb_enable_access_logs = true
alb_enable_waf = false

# Application
app_port = 3000
health_check_port = 3000
health_check_path = "/health"

# Monitoring
enable_metric_streams = false
log_retention_days = 14
security_log_retention_days = 90

# Security
allowed_ssh_ips = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]

# Disaster Recovery
enable_disaster_recovery = false
enable_rds_replication = false
enable_auto_failover = false

# Scaling
enable_scheduled_scaling = true
business_hours_schedule = "0 9 * * 1-5"
business_hours_min_size = 2
business_hours_max_size = 4
business_hours_desired_capacity = 3
off_hours_schedule = "0 18 * * 1-5"
off_hours_min_size = 1
off_hours_max_size = 2
off_hours_desired_capacity = 1

enable_lifecycle_hooks = true
lifecycle_heartbeat_timeout = 300

# Scaling Thresholds
cpu_high_threshold = 75
cpu_low_threshold = 25
memory_high_threshold = 80
memory_low_threshold = 30

# Notifications
notification_email = "devops@claude-flow-novice.com"
slack_webhook_url = ""

# Domain
domain_name = "staging.claude-flow-novice.com"
route53_zone_id = "Z1ABCDEF123456"

# SSL Certificate
alb_certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012"

# Access Logs
alb_access_logs_bucket = "claude-flow-staging-alb-logs"

# RDS (if enabled)
enable_rds_replication = false
rds_engine = "mysql"
rds_engine_version = "8.0"
rds_instance_class = "db.t3.small"
rds_allocated_storage = 50
rds_max_allocated_storage = 500
rds_database_name = "claudeflow_staging"
rds_backup_retention_period = 7
rds_backup_window = "03:00-04:00"
rds_maintenance_window = "sun:04:00-sun:05:00"