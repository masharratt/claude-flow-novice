# Production Environment Configuration

# Basic Configuration
project_name = "claude-flow-novice"
environment = "production"
aws_region = "us-east-1"

# Networking
vpc_cidr = "10.0.0.0/16"
public_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
private_subnet_cidrs = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]
database_subnet_cidrs = ["10.0.21.0/24", "10.0.22.0/24", "10.0.23.0/24"]
enable_nat_gateway = true
enable_vpn_gateway = true

# Auto Scaling
instance_type = "t3.medium"
desired_capacity = 3
min_size = 2
max_size = 10
enable_monitoring = true

# Load Balancer
alb_internal = false
alb_enable_deletion_protection = true
alb_enable_https = true
alb_enable_access_logs = true
alb_enable_connection_logs = true
alb_enable_waf = true

# Application
app_port = 3000
health_check_port = 3000
health_check_path = "/health"

# Monitoring
enable_metric_streams = true
log_retention_days = 30
security_log_retention_days = 365

# Security
allowed_ssh_ips = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]

# Disaster Recovery
enable_disaster_recovery = true
dr_region = "us-west-2"
enable_rds_replication = true
enable_auto_failover = false

# Scaling
enable_scheduled_scaling = true
business_hours_schedule = "0 8 * * 1-5"
business_hours_min_size = 4
business_hours_max_size = 8
business_hours_desired_capacity = 6
off_hours_schedule = "0 20 * * 1-5"
off_hours_min_size = 2
off_hours_max_size = 4
off_hours_desired_capacity = 3

enable_lifecycle_hooks = true
lifecycle_heartbeat_timeout = 600

# Scaling Thresholds
cpu_high_threshold = 70
cpu_low_threshold = 20
memory_high_threshold = 80
memory_low_threshold = 30

# Health Check Thresholds
alb_health_check_interval = 30
alb_health_check_timeout = 5
alb_healthy_threshold = 3
alb_unhealthy_threshold = 3

# Error Thresholds
alb_5xx_error_threshold = 10
alb_4xx_error_threshold = 50
alb_response_time_threshold = 5

# Monitoring Thresholds
cpu_high_evaluation_periods = 2
cpu_low_evaluation_periods = 5
memory_high_evaluation_periods = 2
memory_low_evaluation_periods = 5
disk_high_threshold = 85
disk_high_evaluation_periods = 2
app_error_threshold = 10
app_error_evaluation_periods = 2
app_response_threshold = 5000
app_response_evaluation_periods = 3
security_threshold = 5
security_evaluation_periods = 1

# Notifications
notification_email = "devops@claude-flow-novice.com"
# slack_webhook_url should be set via environment variable TF_VAR_slack_webhook_url or AWS Secrets Manager

# Domain
domain_name = "claude-flow-novice.com"
route53_zone_id = "Z1ABCDEF123456"

# SSL Certificate
alb_certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012"
alb_ssl_policy = "ELBSecurityPolicy-TLS-1-2-2017-01"

# Access Logs
alb_access_logs_bucket = "claude-flow-production-alb-logs"
alb_connection_logs_bucket = "claude-flow-production-connection-logs"

# KMS Encryption
kms_key_id = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"

# RDS Configuration
rds_engine = "mysql"
rds_engine_version = "8.0"
rds_instance_class = "db.t3.medium"
rds_allocated_storage = 100
rds_max_allocated_storage = 1000
rds_kms_key_id = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
rds_database_name = "claudeflow"
rds_username = "claude_admin"
# rds_password should be set via environment variable or secret manager
rds_backup_retention_period = 30
rds_backup_window = "03:00-04:00"
rds_maintenance_window = "sun:04:00-sun:05:00"

# Disaster Recovery Configuration
dr_domain_name = "dr.claude-flow-novice.com"
dr_alb_dns_name = "dr-dashboard-alb-1234567890.us-west-2.elb.amazonaws.com"
dr_alb_zone_id = "Z1ABCDEF123456"

# Health Check Configuration
health_check_failure_threshold = 3
health_check_request_interval = 30
replication_lag_evaluation_periods = 3
replication_lag_period = 300
replication_lag_threshold = 300
rds_replication_lag_threshold = 60

# Additional Security Groups
create_database = true
create_bastion = true
create_ecs = false
create_monitoring = true
monitoring_allowed_cidrs = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]

# Additional Ports
additional_app_ports = {
  "metrics" = {
    port          = 9090
    protocol      = "tcp"
    description   = "Prometheus metrics"
    security_groups = ["sg-1234567890abcdef0"] # Monitoring SG
  }
}

additional_database_ports = {
  "mysql_exporter" = {
    port          = 9104
    protocol      = "tcp"
    description   = "MySQL exporter"
    cidr_blocks   = ["10.0.0.0/8"]
  }
}

# Additional tags
tags = {
  Environment = "production"
  CostCenter  = "engineering"
  Application = "claude-flow-novice"
  ManagedBy   = "terraform"
}