# VPC outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = module.vpc.private_subnet_ids
}

output "database_subnet_ids" {
  description = "IDs of the database subnets"
  value       = module.vpc.database_subnet_ids
}

# Security Group outputs
output "security_group_ids" {
  description = "Security group IDs"
  value       = module.security_groups.security_group_ids
}

# ALB outputs
output "alb_dns_name" {
  description = "DNS name of the load balancer"
  value       = module.alb.alb_dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the load balancer"
  value       = module.alb.alb_zone_id
}

# EC2 outputs
output "instance_ids" {
  description = "IDs of the EC2 instances"
  value       = module.ec2.instance_ids
}

output "instance_public_ips" {
  description = "Public IPs of the EC2 instances"
  value       = module.ec2.instance_public_ips
}

output "instance_private_ips" {
  description = "Private IPs of the EC2 instances"
  value       = module.ec2.instance_private_ips
}

# RDS outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = module.database.rds_endpoint
}

output "rds_port" {
  description = "RDS instance port"
  value       = module.database.rds_port
}

output "rds_instance_id" {
  description = "RDS instance ID"
  value       = module.database.rds_instance_id
}

# ElastiCache outputs
output "redis_endpoint" {
  description = "Redis endpoint"
  value       = module.cache.redis_endpoint
}

output "redis_port" {
  description = "Redis port"
  value       = module.cache.redis_port
}

# S3 outputs
output "s3_bucket_name" {
  description = "S3 bucket name"
  value       = module.storage.s3_bucket_name
}

# CloudFront outputs
output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.cdn.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name"
  value       = module.cdn.cloudfront_domain_name
}

# Monitoring outputs
output "log_group_name" {
  description = "CloudWatch log group name"
  value       = module.monitoring.log_group_name
}

output "alarm_arns" {
  description = "CloudWatch alarm ARNs"
  value       = module.monitoring.alarm_arns
}

# ECS outputs (if using ECS)
output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "ecs_service_names" {
  description = "ECS service names"
  value       = module.ecs.service_names
}

# General outputs
output "region" {
  description = "AWS region"
  value       = data.aws_region.current.name
}

output "account_id" {
  description = "AWS account ID"
  value       = data.aws_caller_identity.current.account_id
}