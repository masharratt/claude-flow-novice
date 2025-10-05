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

# Auto Scaling Group Configuration
variable "subnet_ids" {
  description = "List of subnet IDs for Auto Scaling Group"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "target_group_arns" {
  description = "List of target group ARNs for ALB"
  type        = list(string)
  default     = []
}

variable "desired_capacity" {
  description = "Number of Amazon EC2 instances that should be running in the group"
  type        = number
  default     = 2
}

variable "max_size" {
  description = "Maximum size of the Auto Scaling Group"
  type        = number
  default     = 10
}

variable "min_size" {
  description = "Minimum size of the Auto Scaling Group"
  type        = number
  default     = 1
}

variable "health_check_grace_period" {
  description = "Time after instance comes into service before checking health"
  type        = number
  default     = 300
}

# EC2 Instance Configuration
variable "ami_id" {
  description = "AMI ID for EC2 instances"
  type        = string
  default     = ""
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "key_name" {
  description = "EC2 Key Pair name"
  type        = string
  default     = ""
}

variable "user_data" {
  description = "User data script to configure instances"
  type        = string
  default     = ""
}

variable "iam_instance_profile_name" {
  description = "IAM instance profile name"
  type        = string
  default     = ""
}

variable "enable_detailed_monitoring" {
  description = "Enable detailed CloudWatch monitoring"
  type        = bool
  default     = true
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
  description = "KMS key ID for EBS encryption"
  type        = string
  default     = ""
}

# Scaling Policy Configuration
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

# CPU Monitoring Configuration
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

# Memory Monitoring Configuration
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

# Request Monitoring Configuration
variable "enable_request_monitoring" {
  description = "Enable request-based auto scaling"
  type        = bool
  default     = true
}

variable "alb_target_group_arn" {
  description = "ALB target group ARN for request monitoring"
  type        = string
  default     = ""
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

# Lifecycle Hooks Configuration
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

variable "lifecycle_notification_arn" {
  description = "SNS topic ARN for lifecycle hook notifications"
  type        = string
  default     = ""
}

# Scheduled Scaling Configuration
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