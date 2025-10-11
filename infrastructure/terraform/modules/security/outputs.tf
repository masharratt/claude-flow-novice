output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = aws_security_group.alb.id
}

output "alb_security_group_arn" {
  description = "ARN of the ALB security group"
  value       = aws_security_group.alb.arn
}

output "app_security_group_id" {
  description = "ID of the application security group"
  value       = aws_security_group.app.id
}

output "app_security_group_arn" {
  description = "ARN of the application security group"
  value       = aws_security_group.app.arn
}

output "database_security_group_ids" {
  description = "IDs of the database security groups"
  value       = aws_security_group.database[*].id
}

output "database_security_group_arns" {
  description = "ARNs of the database security groups"
  value       = aws_security_group.database[*].arn
}

output "bastion_security_group_ids" {
  description = "IDs of the bastion security groups"
  value       = aws_security_group.bastion[*].id
}

output "bastion_security_group_arns" {
  description = "ARNs of the bastion security groups"
  value       = aws_security_group.bastion[*].arn
}

output "ecs_security_group_ids" {
  description = "IDs of the ECS security groups"
  value       = aws_security_group.ecs[*].id
}

output "ecs_security_group_arns" {
  description = "ARNs of the ECS security groups"
  value       = aws_security_group.ecs[*].arn
}

output "monitoring_security_group_ids" {
  description = "IDs of the monitoring security groups"
  value       = aws_security_group.monitoring[*].id
}

output "monitoring_security_group_arns" {
  description = "ARNs of the monitoring security groups"
  value       = aws_security_group.monitoring[*].arn
}