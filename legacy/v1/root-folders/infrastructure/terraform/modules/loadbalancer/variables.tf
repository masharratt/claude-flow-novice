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

# Load Balancer Configuration
variable "internal" {
  description = "Whether the load balancer is internal"
  type        = bool
  default     = false
}

variable "security_group_ids" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "subnet_ids" {
  description = "List of subnet IDs"
  type        = list(string)
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection for the load balancer"
  type        = bool
  default     = false
}

# Target Group Configuration
variable "target_port" {
  description = "Port on which targets receive traffic"
  type        = number
  default     = 3000
}

variable "target_protocol" {
  description = "Protocol to use for routing traffic to targets"
  type        = string
  default     = "HTTP"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "target_type" {
  description = "Type of target that you must specify when registering targets with this target group"
  type        = string
  default     = "instance"
}

variable "deregistration_delay" {
  description = "Amount of time to wait for deregistration"
  type        = number
  default     = 300
}

variable "protocol_version" {
  description = "Protocol version to use"
  type        = string
  default     = "HTTP1"
}

# Health Check Configuration
variable "health_check_path" {
  description = "Destination for the health check request"
  type        = string
  default     = "/health"
}

variable "health_check_port" {
  description = "Port to use for health check"
  type        = string
  default     = "traffic-port"
}

variable "health_check_protocol" {
  description = "Protocol to use for health check"
  type        = string
  default     = "HTTP"
}

variable "health_check_interval" {
  description = "Approximate interval between health checks"
  type        = number
  default     = 30
}

variable "health_check_timeout" {
  description = "Amount of time to wait for a health check response"
  type        = number
  default     = 5
}

variable "health_check_matcher" {
  description = "HTTP codes to use when checking for successful responses"
  type        = string
  default     = "200"
}

variable "healthy_threshold" {
  description = "Number of consecutive successful health checks required"
  type        = number
  default     = 3
}

variable "unhealthy_threshold" {
  description = "Number of consecutive failed health checks required"
  type        = number
  default     = 3
}

# Session Affinity
variable "enable_stickiness" {
  description = "Enable session stickiness"
  type        = bool
  default     = false
}

variable "cookie_duration" {
  description = "Cookie duration in seconds"
  type        = number
  default     = 86400
}

# SSL Configuration
variable "enable_https" {
  description = "Enable HTTPS listener"
  type        = bool
  default     = true
}

variable "certificate_arn" {
  description = "ARN of the SSL certificate"
  type        = string
  default     = ""
}

variable "ssl_policy" {
  description = "SSL policy"
  type        = string
  default     = "ELBSecurityPolicy-2016-08"
}

# Access Logs Configuration
variable "enable_access_logs" {
  description = "Enable access logs"
  type        = bool
  default     = true
}

variable "access_logs_bucket" {
  description = "S3 bucket for access logs"
  type        = string
  default     = ""
}

variable "create_log_group" {
  description = "Create CloudWatch log group for access logs"
  type        = bool
  default     = true
}

variable "enable_connection_logs" {
  description = "Enable connection logs"
  type        = bool
  default     = false
}

variable "connection_logs_bucket" {
  description = "S3 bucket for connection logs"
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "Log retention period in days"
  type        = number
  default     = 30
}

# WAF Configuration
variable "enable_waf" {
  description = "Enable WAF association"
  type        = bool
  default     = true
}

variable "waf_web_acl_arn" {
  description = "ARN of the WAF Web ACL"
  type        = string
  default     = ""
}

# Monitoring and Alarms Configuration
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

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for alarm notifications"
  type        = string
  default     = ""
}

# Route 53 Configuration
variable "domain_name" {
  description = "Domain name for the load balancer"
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID"
  type        = string
  default     = ""
}