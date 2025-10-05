terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }

    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }

    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }

    local = {
      source  = "hashicorp/local"
      version = "~> 2.4"
    }

    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Remote state backend configuration
  backend "s3" {
    bucket         = "claude-flow-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}

# Provider configuration
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Claude Flow Novice"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = "devops-team"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Random resources for unique naming
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# VPC Module
module "vpc" {
  source = "./modules/vpc"

  project_name            = var.project_name
  environment            = var.environment
  name_prefix            = var.name_prefix
  tags                   = var.tags
  vpc_cidr               = var.vpc_cidr
  public_subnet_cidrs    = var.public_subnet_cidrs
  private_subnet_cidrs   = var.private_subnet_cidrs
  database_subnet_cidrs  = var.database_subnet_cidrs
  enable_nat_gateway     = var.enable_nat_gateway
  enable_vpn_gateway     = var.enable_vpn_gateway
  log_retention_days     = var.log_retention_days
}

# Security Groups Module
module "security" {
  source = "./modules/security"

  project_name                    = var.project_name
  environment                    = var.environment
  name_prefix                    = var.name_prefix
  tags                           = var.tags
  vpc_id                         = module.vpc.vpc_id
  app_port                       = var.app_port
  health_check_port              = var.health_check_port
  enable_monitoring              = var.enable_monitoring
  allowed_ssh_ips                = var.allowed_ssh_ips
  database_port                  = var.database_port
  create_database_sg             = var.create_database
  create_bastion_sg              = var.create_bastion
  create_ecs_sg                  = var.create_ecs
  create_monitoring_sg           = var.create_monitoring
  monitoring_allowed_cidrs       = var.monitoring_allowed_cidrs
  additional_app_ports           = var.additional_app_ports
  additional_database_ports      = var.additional_database_ports
}

# Load Balancer Module
module "loadbalancer" {
  source = "./modules/loadbalancer"

  project_name                    = var.project_name
  environment                    = var.environment
  name_prefix                    = var.name_prefix
  tags                           = var.tags
  internal                       = var.alb_internal
  security_group_ids             = [module.security.alb_security_group_id]
  subnet_ids                     = module.vpc.public_subnet_ids
  enable_deletion_protection     = var.alb_enable_deletion_protection
  target_port                    = var.app_port
  target_protocol                = var.alb_target_protocol
  vpc_id                         = module.vpc.vpc_id
  target_type                    = var.alb_target_type
  deregistration_delay           = var.alb_deregistration_delay
  health_check_path              = var.health_check_path
  health_check_port              = var.health_check_port
  health_check_protocol          = var.alb_health_check_protocol
  health_check_interval          = var.alb_health_check_interval
  health_check_timeout           = var.alb_health_check_timeout
  health_check_matcher           = var.alb_health_check_matcher
  healthy_threshold              = var.alb_healthy_threshold
  unhealthy_threshold            = var.alb_unhealthy_threshold
  enable_stickiness              = var.alb_enable_stickiness
  cookie_duration                = var.alb_cookie_duration
  enable_https                   = var.alb_enable_https
  certificate_arn                = var.alb_certificate_arn
  ssl_policy                     = var.alb_ssl_policy
  enable_access_logs             = var.alb_enable_access_logs
  access_logs_bucket             = var.alb_access_logs_bucket
  create_log_group               = var.alb_create_log_group
  enable_connection_logs         = var.alb_enable_connection_logs
  connection_logs_bucket         = var.alb_connection_logs_bucket
  log_retention_days             = var.log_retention_days
  enable_waf                     = var.alb_enable_waf
  waf_web_acl_arn                = var.alb_waf_web_acl_arn
  alb_error_evaluation_periods   = var.alb_error_evaluation_periods
  alb_error_period               = var.alb_error_period
  alb_5xx_error_threshold        = var.alb_5xx_error_threshold
  alb_4xx_error_threshold        = var.alb_4xx_error_threshold
  alb_response_evaluation_periods = var.alb_response_evaluation_periods
  alb_response_period            = var.alb_response_period
  alb_response_time_threshold    = var.alb_response_time_threshold
  alb_health_evaluation_periods  = var.alb_health_evaluation_periods
  alb_health_period              = var.alb_health_period
  alb_unhealthy_hosts_threshold  = var.alb_unhealthy_hosts_threshold
  alb_connection_evaluation_periods = var.alb_connection_evaluation_periods
  alb_connection_period          = var.alb_connection_period
  alb_connection_error_threshold = var.alb_connection_error_threshold
  alarm_sns_topic_arn            = module.monitoring.alerts_sns_topic_arn
  domain_name                    = var.domain_name
  route53_zone_id                = var.route53_zone_id
}

# Auto Scaling Module
module "autoscaling" {
  source = "./modules/autoscaling"

  project_name                    = var.project_name
  environment                    = var.environment
  name_prefix                    = var.name_prefix
  tags                           = var.tags
  subnet_ids                     = module.vpc.private_subnet_ids
  security_group_ids             = [module.security.app_security_group_id]
  target_group_arns              = [module.loadbalancer.target_group_arn]
  desired_capacity               = var.desired_capacity
  max_size                       = var.max_size
  min_size                       = var.min_size
  health_check_grace_period      = var.health_check_grace_period
  ami_id                         = var.ami_id
  instance_type                  = var.instance_type
  key_name                       = var.key_name
  user_data                      = var.user_data
  iam_instance_profile_name      = var.iam_instance_profile_name
  enable_detailed_monitoring     = var.enable_monitoring
  root_volume_size               = var.root_volume_size
  root_volume_type               = var.root_volume_type
  kms_key_id                     = var.kms_key_id
  scale_out_adjustment           = var.scale_out_adjustment
  scale_in_adjustment            = var.scale_in_adjustment
  scale_out_cooldown             = var.scale_out_cooldown
  scale_in_cooldown              = var.scale_in_cooldown
  cpu_high_threshold             = var.cpu_high_threshold
  cpu_low_threshold              = var.cpu_low_threshold
  cpu_high_evaluation_periods    = var.cpu_high_evaluation_periods
  cpu_low_evaluation_periods     = var.cpu_low_evaluation_periods
  cpu_high_period                = var.cpu_high_period
  cpu_low_period                 = var.cpu_low_period
  enable_memory_monitoring       = var.enable_memory_monitoring
  memory_high_threshold          = var.memory_high_threshold
  memory_low_threshold           = var.memory_low_threshold
  memory_high_evaluation_periods = var.memory_high_evaluation_periods
  memory_low_evaluation_periods  = var.memory_low_evaluation_periods
  memory_high_period             = var.memory_high_period
  memory_low_period              = var.memory_low_period
  enable_request_monitoring      = var.enable_request_monitoring
  alb_target_group_arn           = module.loadbalancer.target_group_arn
  requests_high_threshold        = var.requests_high_threshold
  requests_low_threshold         = var.requests_low_threshold
  requests_high_evaluation_periods = var.requests_high_evaluation_periods
  requests_low_evaluation_periods = var.requests_low_evaluation_periods
  requests_high_period           = var.requests_high_period
  requests_low_period            = var.requests_low_period
  enable_lifecycle_hooks         = var.enable_lifecycle_hooks
  lifecycle_heartbeat_timeout    = var.lifecycle_heartbeat_timeout
  lifecycle_notification_arn     = module.monitoring.alerts_sns_topic_arn
  enable_scheduled_scaling       = var.enable_scheduled_scaling
  business_hours_schedule        = var.business_hours_schedule
  business_hours_min_size        = var.business_hours_min_size
  business_hours_max_size        = var.business_hours_max_size
  business_hours_desired_capacity = var.business_hours_desired_capacity
  off_hours_schedule             = var.off_hours_schedule
  off_hours_min_size             = var.off_hours_min_size
  off_hours_max_size             = var.off_hours_max_size
  off_hours_desired_capacity     = var.off_hours_desired_capacity
}

# Monitoring Module
module "monitoring" {
  source = "./modules/monitoring"

  project_name                    = var.project_name
  environment                    = var.environment
  name_prefix                    = var.name_prefix
  tags                           = var.tags
  aws_region                     = var.aws_region
  autoscaling_group_name         = module.autoscaling.autoscaling_group_name
  alb_arn_suffix                 = module.loadbalancer.load_balancer_arn_suffix
  notification_email             = var.notification_email
  slack_webhook_url              = var.slack_webhook_url
  log_retention_days             = var.log_retention_days
  security_log_retention_days    = var.security_log_retention_days
  cpu_high_threshold             = var.cpu_high_threshold
  cpu_low_threshold              = var.cpu_low_threshold
  cpu_high_evaluation_periods    = var.cpu_high_evaluation_periods
  cpu_low_evaluation_periods     = var.cpu_low_evaluation_periods
  cpu_period                     = var.cpu_high_period
  memory_high_threshold          = var.memory_high_threshold
  memory_high_evaluation_periods = var.memory_high_evaluation_periods
  memory_period                  = var.memory_high_period
  disk_high_threshold            = var.disk_high_threshold
  disk_high_evaluation_periods   = var.disk_high_evaluation_periods
  disk_period                    = var.disk_period
  app_error_threshold            = var.app_error_threshold
  app_error_evaluation_periods   = var.app_error_evaluation_periods
  app_error_period               = var.app_error_period
  app_response_threshold         = var.app_response_threshold
  app_response_evaluation_periods = var.app_response_evaluation_periods
  app_response_period            = var.app_response_period
  security_threshold             = var.security_threshold
  security_evaluation_periods    = var.security_evaluation_periods
  security_period                = var.security_period
  enable_metric_streams          = var.enable_metric_streams
}

# Disaster Recovery Module (if enabled)
module "disaster_recovery" {
  count  = var.enable_disaster_recovery ? 1 : 0
  source = "./modules/disaster-recovery"

  project_name                      = var.project_name
  environment                      = var.environment
  name_prefix                      = var.name_prefix
  tags                             = var.tags
  aws_region                       = var.aws_region
  dr_region                        = var.dr_region
  backup_retention_days             = var.backup_retention_days
  log_retention_days                = var.log_retention_days
  enable_rds_replication            = var.enable_rds_replication
  rds_engine                       = var.rds_engine
  rds_engine_version               = var.rds_engine_version
  rds_instance_class               = var.rds_instance_class
  rds_allocated_storage            = var.rds_allocated_storage
  rds_max_allocated_storage        = var.rds_max_allocated_storage
  rds_kms_key_id                   = var.rds_kms_key_id
  rds_database_name                = var.rds_database_name
  rds_username                     = var.rds_username
  rds_password                     = var.rds_password
  rds_security_group_ids           = var.create_database ? [module.security.database_security_group_ids[0]] : []
  rds_subnet_group_name            = var.rds_subnet_group_name
  dr_rds_security_group_ids        = var.dr_rds_security_group_ids
  dr_rds_subnet_group_name         = var.dr_rds_subnet_group_name
  rds_backup_retention_period      = var.rds_backup_retention_period
  rds_backup_window                = var.rds_backup_window
  rds_maintenance_window           = var.rds_maintenance_window
  primary_health_check_fqdn        = var.domain_name
  primary_health_check_port        = 443
  primary_health_check_type        = "HTTPS"
  primary_health_check_path        = "/health"
  dr_health_check_fqdn             = var.dr_domain_name
  dr_health_check_port             = 443
  dr_health_check_type             = "HTTPS"
  dr_health_check_path             = "/health"
  health_check_failure_threshold   = var.health_check_failure_threshold
  health_check_request_interval    = var.health_check_request_interval
  replication_lag_evaluation_periods = var.replication_lag_evaluation_periods
  replication_lag_period           = var.replication_lag_period
  replication_lag_threshold        = var.replication_lag_threshold
  rds_replication_lag_threshold    = var.rds_replication_lag_threshold
  route53_zone_id                  = var.route53_zone_id
  domain_name                      = var.domain_name
  primary_alb_dns_name             = module.loadbalancer.load_balancer_dns_name
  primary_alb_zone_id              = module.loadbalancer.load_balancer_zone_id
  dr_alb_dns_name                  = var.dr_alb_dns_name
  dr_alb_zone_id                   = var.dr_alb_zone_id
  dr_sns_topic_arn                 = module.monitoring.alerts_sns_topic_arn
  notification_email               = var.notification_email
  enable_auto_failover             = var.enable_auto_failover
}

# Local values
locals {
  name_prefix = var.name_prefix != "" ? var.name_prefix : "${var.project_name}-${var.environment}"
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Owner       = "devops-team"
    CreatedAt   = timestamp()
  }
}