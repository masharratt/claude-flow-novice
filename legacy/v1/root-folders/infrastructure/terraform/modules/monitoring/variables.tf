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

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

# Infrastructure References
variable "autoscaling_group_name" {
  description = "Name of the Auto Scaling Group"
  type        = string
}

variable "alb_arn_suffix" {
  description = "ARN suffix of the Application Load Balancer"
  type        = string
}

# Notification Configuration
variable "notification_email" {
  description = "Email for notifications"
  type        = string
  default     = ""
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for notifications"
  type        = string
  default     = ""
}

# Log Configuration
variable "log_retention_days" {
  description = "Log retention period in days"
  type        = number
  default     = 30
}

variable "security_log_retention_days" {
  description = "Security log retention period in days"
  type        = number
  default     = 365
}

# CPU Monitoring
variable "cpu_high_threshold" {
  description = "CPU utilization high threshold (percentage)"
  type        = number
  default     = 80
}

variable "cpu_low_threshold" {
  description = "CPU utilization low threshold (percentage)"
  type        = number
  default     = 20
}

variable "cpu_high_evaluation_periods" {
  description = "Number of periods to evaluate for high CPU threshold"
  type        = number
  default     = 3
}

variable "cpu_low_evaluation_periods" {
  description = "Number of periods to evaluate for low CPU threshold"
  type        = number
  default     = 5
}

variable "cpu_period" {
  description = "Period for CPU metric evaluation (seconds)"
  type        = number
  default     = 300
}

# Memory Monitoring
variable "memory_high_threshold" {
  description = "Memory utilization high threshold (percentage)"
  type        = number
  default     = 85
}

variable "memory_high_evaluation_periods" {
  description = "Number of periods to evaluate for high memory threshold"
  type        = number
  default     = 3
}

variable "memory_period" {
  description = "Period for memory metric evaluation (seconds)"
  type        = number
  default     = 300
}

# Disk Monitoring
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

# Application Monitoring
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

# Security Monitoring
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

# Metric Streams
variable "enable_metric_streams" {
  description = "Enable CloudWatch metric streams"
  type        = bool
  default     = false
}