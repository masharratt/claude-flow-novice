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

# VPC Configuration
variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

# Application Configuration
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

variable "enable_monitoring" {
  description = "Enable monitoring ports"
  type        = bool
  default     = true
}

variable "allowed_ssh_ips" {
  description = "List of CIDR blocks allowed for SSH access"
  type        = list(string)
  default     = []
}

# Database Configuration
variable "database_port" {
  description = "Database port"
  type        = number
  default     = 3306
}

variable "database_security_group_id" {
  description = "Existing database security group ID"
  type        = string
  default     = ""
}

variable "create_database_sg" {
  description = "Create database security group"
  type        = bool
  default     = true
}

variable "dr_database_sg_cidr" {
  description = "CIDR block for DR database access"
  type        = string
  default     = ""
}

# Bastion Configuration
variable "create_bastion_sg" {
  description = "Create bastion security group"
  type        = bool
  default     = false
}

variable "bastion_security_group_id" {
  description = "Existing bastion security group ID"
  type        = string
  default     = ""
}

# ECS/EKS Configuration
variable "create_ecs_sg" {
  description = "Create ECS/EKS security group"
  type        = bool
  default     = false
}

# Monitoring Configuration
variable "create_monitoring_sg" {
  description = "Create monitoring security group"
  type        = bool
  default     = false
}

variable "monitoring_allowed_cidrs" {
  description = "CIDR blocks allowed for monitoring access"
  type        = list(string)
  default     = ["10.0.0.0/8"]
}

# Additional Ports Configuration
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