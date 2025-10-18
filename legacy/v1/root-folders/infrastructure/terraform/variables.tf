variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "claude-flow-novice"
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be one of: dev, staging, production."
  }
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for database subnets"
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24"]
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"

  validation {
    condition     = contains(["t3.micro", "t3.small", "t3.medium", "t3.large", "t3.xlarge"], var.instance_type)
    error_message = "Instance type must be a valid t3 instance."
  }
}

variable "instance_count" {
  description = "Number of EC2 instances"
  type        = number
  default     = 2

  validation {
    condition     = var.instance_count >= 1 && var.instance_count <= 10
    error_message = "Instance count must be between 1 and 10."
  }
}

variable "enable_monitoring" {
  description = "Enable detailed monitoring"
  type        = bool
  default     = true
}

variable "enable_backup" {
  description = "Enable backup for database"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Backup retention period in days"
  type        = number
  default     = 30

  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 365
    error_message = "Backup retention must be between 1 and 365 days."
  }
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "claude-flow-novice.com"
}

variable "ssl_certificate_arn" {
  description = "ARN of SSL certificate"
  type        = string
  default     = ""
}

variable "enable_cloudfront" {
  description = "Enable CloudFront CDN"
  type        = bool
  default     = false
}

variable "enable_waf" {
  description = "Enable AWS WAF"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Log retention period in days"
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 730, 1825, 3653], var.log_retention_days)
    error_message = "Log retention must be a valid CloudWatch Logs retention period."
  }
}

variable "notification_email" {
  description = "Email for notifications"
  type        = string
  default     = "devops@claude-flow-novice.com"
}

variable "allowed_ssh_ips" {
  description = "List of IPs allowed for SSH access"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}

# Additional Infrastructure Variables
variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
  default     = ""
}

variable "app_port" {
  description = "Application port"
  type        = number
  default     = 3000
}

variable "health_check_port" {
  description = "Health check port"
  type        = number
  default     = 3000
}

variable "health_check_grace_period" {
  description = "Health check grace period in seconds"
  type        = number
  default     = 300
}

variable "ami_id" {
  description = "AMI ID for EC2 instances"
  type        = string
  default     = ""
}

variable "key_name" {
  description = "EC2 Key Pair name"
  type        = string
  default     = ""
}

variable "user_data" {
  description = "User data script for EC2 instances"
  type        = string
  default     = ""
}

variable "iam_instance_profile_name" {
  description = "IAM instance profile name"
  type        = string
  default     = ""
}

variable "root_volume_size" {
  description = "Root volume size in GB"
  type        = number
  default     = 30
}

variable "root_volume_type" {
  description = "Root volume type"
  type        = string
  default     = "gp3"
}

variable "kms_key_id" {
  description = "KMS key ID for encryption"
  type        = string
  default     = ""
}

# Auto Scaling Variables
variable "scale_out_adjustment" {
  description = "Number of instances to add when scaling out"
  type        = number
  default     = 1
}

variable "scale_in_adjustment" {
  description = "Number of instances to remove when scaling in"
  type        = number
  default     = -1
}

variable "scale_out_cooldown" {
  description = "Cooldown period after scaling out (seconds)"
  type        = number
  default     = 300
}

variable "scale_in_cooldown" {
  description = "Cooldown period after scaling in (seconds)"
  type        = number
  default     = 300
}

variable "cpu_high_threshold" {
  description = "CPU utilization high threshold (percentage)"
  type        = number
  default     = 70
}

variable "cpu_low_threshold" {
  description = "CPU utilization low threshold (percentage)"
  type        = number
  default     = 20
}

variable "cpu_high_evaluation_periods" {
  description = "Number of periods to evaluate for high CPU threshold"
  type        = number
  default     = 2
}

variable "cpu_low_evaluation_periods" {
  description = "Number of periods to evaluate for low CPU threshold"
  type        = number
  default     = 5
}

variable "cpu_high_period" {
  description = "Period for CPU high metric evaluation (seconds)"
  type        = number
  default     = 300
}

variable "cpu_low_period" {
  description = "Period for CPU low metric evaluation (seconds)"
  type        = number
  default     = 300
}

variable "enable_memory_monitoring" {
  description = "Enable memory-based auto scaling"
  type        = bool
  default     = true
}

variable "memory_high_threshold" {
  description = "Memory utilization high threshold (percentage)"
  type        = number
  default     = 80
}

variable "memory_low_threshold" {
  description = "Memory utilization low threshold (percentage)"
  type        = number
  default     = 30
}

variable "memory_high_evaluation_periods" {
  description = "Number of periods to evaluate for high memory threshold"
  type        = number
  default     = 2
}

variable "memory_low_evaluation_periods" {
  description = "Number of periods to evaluate for low memory threshold"
  type        = number
  default     = 5
}

variable "memory_high_period" {
  description = "Period for memory high metric evaluation (seconds)"
  type        = number
  default     = 300
}

variable "memory_low_period" {
  description = "Period for memory low metric evaluation (seconds)"
  type        = number
  default     = 300
}

variable "enable_request_monitoring" {
  description = "Enable request-based auto scaling"
  type        = bool
  default     = true
}

variable "requests_high_threshold" {
  description = "Request count high threshold"
  type        = number
  default     = 1000
}

variable "requests_low_threshold" {
  description = "Request count low threshold"
  type        = number
  default     = 100
}

variable "requests_high_evaluation_periods" {
  description = "Number of periods to evaluate for high request threshold"
  type        = number
  default     = 2
}

variable "requests_low_evaluation_periods" {
  description = "Number of periods to evaluate for low request threshold"
  type        = number
  default     = 5
}

variable "requests_high_period" {
  description = "Period for request high metric evaluation (seconds)"
  type        = number
  default     = 300
}

variable "requests_low_period" {
  description = "Period for request low metric evaluation (seconds)"
  type        = number
  default     = 300
}

variable "enable_lifecycle_hooks" {
  description = "Enable lifecycle hooks for graceful deployment"
  type        = bool
  default     = true
}

variable "lifecycle_heartbeat_timeout" {
  description = "Heartbeat timeout for lifecycle hooks (seconds)"
  type        = number
  default     = 300
}

variable "enable_scheduled_scaling" {
  description = "Enable scheduled scaling"
  type        = bool
  default     = true
}

variable "business_hours_schedule" {
  description = "Cron schedule for business hours scaling"
  type        = string
  default     = "0 8 * * 1-5"
}

variable "business_hours_min_size" {
  description = "Minimum size during business hours"
  type        = number
  default     = 2
}

variable "business_hours_max_size" {
  description = "Maximum size during business hours"
  type        = number
  default     = 8
}

variable "business_hours_desired_capacity" {
  description = "Desired capacity during business hours"
  type        = number
  default     = 4
}

variable "off_hours_schedule" {
  description = "Cron schedule for off-hours scaling"
  type        = string
  default     = "0 20 * * 1-5"
}

variable "off_hours_min_size" {
  description = "Minimum size during off hours"
  type        = number
  default     = 1
}

variable "off_hours_max_size" {
  description = "Maximum size during off hours"
  type        = number
  default     = 3
}

variable "off_hours_desired_capacity" {
  description = "Desired capacity during off hours"
  type        = number
  default     = 2
}

# ALB Variables
variable "alb_internal" {
  description = "Whether the load balancer is internal"
  type        = bool
  default     = false
}

variable "alb_enable_deletion_protection" {
  description = "Enable deletion protection for the load balancer"
  type        = bool
  default     = false
}

variable "alb_target_protocol" {
  description = "Protocol to use for routing traffic to targets"
  type        = string
  default     = "HTTP"
}

variable "alb_target_type" {
  description = "Type of target for the target group"
  type        = string
  default     = "instance"
}

variable "alb_deregistration_delay" {
  description = "Amount of time to wait for deregistration"
  type        = number
  default     = 300
}

variable "alb_health_check_protocol" {
  description = "Protocol to use for health check"
  type        = string
  default     = "HTTP"
}

variable "alb_health_check_interval" {
  description = "Approximate interval between health checks"
  type        = number
  default     = 30
}

variable "alb_health_check_timeout" {
  description = "Amount of time to wait for a health check response"
  type        = number
  default     = 5
}

variable "alb_health_check_matcher" {
  description = "HTTP codes to use when checking for successful responses"
  type        = string
  default     = "200"
}

variable "alb_healthy_threshold" {
  description = "Number of consecutive successful health checks required"
  type        = number
  default     = 3
}

variable "alb_unhealthy_threshold" {
  description = "Number of consecutive failed health checks required"
  type        = number
  default     = 3
}

variable "alb_enable_stickiness" {
  description = "Enable session stickiness"
  type        = bool
  default     = false
}

variable "alb_cookie_duration" {
  description = "Cookie duration in seconds"
  type        = number
  default     = 86400
}

variable "alb_enable_https" {
  description = "Enable HTTPS listener"
  type        = bool
  default     = true
}

variable "alb_certificate_arn" {
  description = "ARN of the SSL certificate"
  type        = string
  default     = ""
}

variable "alb_ssl_policy" {
  description = "SSL policy"
  type        = string
  default     = "ELBSecurityPolicy-2016-08"
}

variable "alb_enable_access_logs" {
  description = "Enable access logs"
  type        = bool
  default     = true
}

variable "alb_access_logs_bucket" {
  description = "S3 bucket for access logs"
  type        = string
  default     = ""
}

variable "alb_create_log_group" {
  description = "Create CloudWatch log group for access logs"
  type        = bool
  default     = true
}

variable "alb_enable_connection_logs" {
  description = "Enable connection logs"
  type        = bool
  default     = false
}

variable "alb_connection_logs_bucket" {
  description = "S3 bucket for connection logs"
  type        = string
  default     = ""
}

variable "alb_enable_waf" {
  description = "Enable WAF association"
  type        = bool
  default     = true
}

variable "alb_waf_web_acl_arn" {
  description = "ARN of the WAF Web ACL"
  type        = string
  default     = ""
}

variable "alb_error_evaluation_periods" {
  description = "Number of periods to evaluate for ALB error rate"
  type        = number
  default     = 2
}

variable "alb_error_period" {
  description = "Period for ALB error rate evaluation (seconds)"
  type        = number
  default     = 300
}

variable "alb_5xx_error_threshold" {
  description = "Threshold for 5XX error rate"
  type        = number
  default     = 10
}

variable "alb_4xx_error_threshold" {
  description = "Threshold for 4XX error rate"
  type        = number
  default     = 50
}

variable "alb_response_evaluation_periods" {
  description = "Number of periods to evaluate for ALB response time"
  type        = number
  default     = 3
}

variable "alb_response_period" {
  description = "Period for ALB response time evaluation (seconds)"
  type        = number
  default     = 300
}

variable "alb_response_time_threshold" {
  description = "Threshold for ALB response time (seconds)"
  type        = number
  default     = 5
}

variable "alb_health_evaluation_periods" {
  description = "Number of periods to evaluate for ALB health"
  type        = number
  default     = 2
}

variable "alb_health_period" {
  description = "Period for ALB health evaluation (seconds)"
  type        = number
  default     = 300
}

variable "alb_unhealthy_hosts_threshold" {
  description = "Threshold for unhealthy hosts count"
  type        = number
  default     = 0
}

variable "alb_connection_evaluation_periods" {
  description = "Number of periods to evaluate for ALB connection errors"
  type        = number
  default     = 2
}

variable "alb_connection_period" {
  description = "Period for ALB connection errors evaluation (seconds)"
  type        = number
  default     = 300
}

variable "alb_connection_error_threshold" {
  description = "Threshold for ALB connection errors"
  type        = number
  default     = 5
}

# Security Variables
variable "create_database" {
  description = "Create database security group"
  type        = bool
  default     = true
}

variable "create_bastion" {
  description = "Create bastion security group"
  type        = bool
  default     = false
}

variable "create_ecs" {
  description = "Create ECS security group"
  type        = bool
  default     = false
}

variable "create_monitoring" {
  description = "Create monitoring security group"
  type        = bool
  default     = false
}

variable "monitoring_allowed_cidrs" {
  description = "CIDR blocks allowed for monitoring access"
  type        = list(string)
  default     = ["10.0.0.0/8"]
}

variable "additional_app_ports" {
  description = "Additional ports for application security group"
  type = map(object({
    port          = number
    protocol      = string
    description   = string
    cidr_blocks   = optional(list(string))
    security_groups = optional(list(string))
  }))
  default = {}
}

variable "additional_database_ports" {
  description = "Additional ports for database security group"
  type = map(object({
    port          = number
    protocol      = string
    description   = string
    cidr_blocks   = optional(list(string))
    security_groups = optional(list(string))
  }))
  default = {}
}

# VPC Variables
variable "enable_nat_gateway" {
  description = "Enable NAT gateway"
  type        = bool
  default     = true
}

variable "enable_vpn_gateway" {
  description = "Enable VPN gateway"
  type        = bool
  default     = false
}

# Monitoring Variables
variable "security_log_retention_days" {
  description = "Security log retention period in days"
  type        = number
  default     = 365
}

variable "disk_high_threshold" {
  description = "Disk utilization high threshold (percentage)"
  type        = number
  default     = 85
}

variable "disk_high_evaluation_periods" {
  description = "Number of periods to evaluate for high disk threshold"
  type        = number
  default     = 2
}

variable "disk_period" {
  description = "Period for disk metric evaluation (seconds)"
  type        = number
  default     = 300
}

variable "app_error_threshold" {
  description = "Application error threshold"
  type        = number
  default     = 10
}

variable "app_error_evaluation_periods" {
  description = "Number of periods to evaluate for application errors"
  type        = number
  default     = 2
}

variable "app_error_period" {
  description = "Period for application error evaluation (seconds)"
  type        = number
  default     = 300
}

variable "app_response_threshold" {
  description = "Application response time threshold (milliseconds)"
  type        = number
  default     = 5000
}

variable "app_response_evaluation_periods" {
  description = "Number of periods to evaluate for application response time"
  type        = number
  default     = 3
}

variable "app_response_period" {
  description = "Period for application response time evaluation (seconds)"
  type        = number
  default     = 300
}

variable "security_threshold" {
  description = "Security events threshold"
  type        = number
  default     = 5
}

variable "security_evaluation_periods" {
  description = "Number of periods to evaluate for security events"
  type        = number
  default     = 1
}

variable "security_period" {
  description = "Period for security events evaluation (seconds)"
  type        = number
  default     = 300
}

variable "enable_metric_streams" {
  description = "Enable CloudWatch metric streams"
  type        = bool
  default     = false
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for notifications"
  type        = string
  default     = ""
}

# Disaster Recovery Variables
variable "enable_disaster_recovery" {
  description = "Enable disaster recovery infrastructure"
  type        = bool
  default     = false
}

variable "dr_region" {
  description = "Disaster recovery AWS region"
  type        = string
  default     = "us-west-2"
}

variable "enable_rds_replication" {
  description = "Enable RDS cross-region read replica"
  type        = bool
  default     = false
}

variable "rds_engine" {
  description = "RDS engine type"
  type        = string
  default     = "mysql"
}

variable "rds_engine_version" {
  description = "RDS engine version"
  type        = string
  default     = "8.0"
}

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "rds_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 100
}

variable "rds_max_allocated_storage" {
  description = "RDS maximum allocated storage in GB"
  type        = number
  default     = 1000
}

variable "rds_kms_key_id" {
  description = "KMS key ID for RDS encryption"
  type        = string
  default     = ""
}

variable "rds_database_name" {
  description = "RDS database name"
  type        = string
  default     = "claudeflow"
}

variable "rds_username" {
  description = "RDS master username"
  type        = string
  default     = "admin"
}

variable "rds_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "rds_subnet_group_name" {
  description = "DB subnet group name"
  type        = string
  default     = ""
}

variable "dr_rds_security_group_ids" {
  description = "Security group IDs for DR RDS"
  type        = list(string)
  default     = []
}

variable "dr_rds_subnet_group_name" {
  description = "DB subnet group name for DR RDS"
  type        = string
  default     = ""
}

variable "rds_backup_retention_period" {
  description = "RDS backup retention period in days"
  type        = number
  default     = 7
}

variable "rds_backup_window" {
  description = "RDS backup window"
  type        = string
  default     = "03:00-04:00"
}

variable "rds_maintenance_window" {
  description = "RDS maintenance window"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

variable "health_check_failure_threshold" {
  description = "Health check failure threshold"
  type        = number
  default     = 3
}

variable "health_check_request_interval" {
  description = "Health check request interval in seconds"
  type        = number
  default     = 30
}

variable "replication_lag_evaluation_periods" {
  description = "Number of periods to evaluate for replication lag"
  type        = number
  default     = 3
}

variable "replication_lag_period" {
  description = "Period for replication lag evaluation (seconds)"
  type        = number
  default     = 300
}

variable "replication_lag_threshold" {
  description = "Threshold for replication lag (seconds)"
  type        = number
  default     = 300
}

variable "rds_replication_lag_threshold" {
  description = "Threshold for RDS replication lag (seconds)"
  type        = number
  default     = 60
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID"
  type        = string
  default     = ""
}

variable "dr_domain_name" {
  description = "Domain name for DR region"
  type        = string
  default     = ""
}

variable "dr_alb_dns_name" {
  description = "DNS name of DR ALB"
  type        = string
  default     = ""
}

variable "dr_alb_zone_id" {
  description = "Zone ID of DR ALB"
  type        = string
  default     = ""
}

variable "enable_auto_failover" {
  description = "Enable automatic failover"
  type        = bool
  default     = false
}