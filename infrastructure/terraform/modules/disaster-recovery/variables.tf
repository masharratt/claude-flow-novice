variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "claude-flow-novice"
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  default     = "production"
}

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}

# Region Configuration
variable "aws_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-1"
}

variable "dr_region" {
  description = "Disaster recovery AWS region"
  type        = string
  default     = "us-west-2"
}

# Backup Configuration
variable "backup_retention_days" {
  description = "Backup retention period in days"
  type        = number
  default     = 365
}

variable "log_retention_days" {
  description = "Log retention period in days"
  type        = number
  default     = 30
}

# RDS Replication Configuration
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

variable "rds_security_group_ids" {
  description = "Security group IDs for primary RDS"
  type        = list(string)
  default     = []
}

variable "rds_subnet_group_name" {
  description = "DB subnet group name for primary RDS"
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

# Health Check Configuration
variable "primary_health_check_fqdn" {
  description = "FQDN for primary health check"
  type        = string
}

variable "primary_health_check_port" {
  description = "Port for primary health check"
  type        = number
  default     = 443
}

variable "primary_health_check_type" {
  description = "Type of primary health check"
  type        = string
  default     = "HTTPS"
}

variable "primary_health_check_path" {
  description = "Path for primary health check"
  type        = string
  default     = "/health"
}

variable "dr_health_check_fqdn" {
  description = "FQDN for DR health check"
  type        = string
}

variable "dr_health_check_port" {
  description = "Port for DR health check"
  type        = number
  default     = 443
}

variable "dr_health_check_type" {
  description = "Type of DR health check"
  type        = string
  default     = "HTTPS"
}

variable "dr_health_check_path" {
  description = "Path for DR health check"
  type        = string
  default     = "/health"
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

# Replication Monitoring
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

# Route 53 Configuration
variable "route53_zone_id" {
  description = "Route 53 hosted zone ID"
  type        = string
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
}

variable "primary_alb_dns_name" {
  description = "DNS name of primary ALB"
  type        = string
}

variable "primary_alb_zone_id" {
  description = "Zone ID of primary ALB"
  type        = string
}

variable "dr_alb_dns_name" {
  description = "DNS name of DR ALB"
  type        = string
}

variable "dr_alb_zone_id" {
  description = "Zone ID of DR ALB"
  type        = string
}

# Notification Configuration
variable "dr_sns_topic_arn" {
  description = "SNS topic ARN for DR notifications"
  type        = string
  default     = ""
}

variable "notification_email" {
  description = "Email for DR notifications"
  type        = string
  default     = ""
}

# Failover Automation
variable "enable_auto_failover" {
  description = "Enable automatic failover"
  type        = bool
  default     = false
}