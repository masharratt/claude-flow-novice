output "primary_s3_bucket_name" {
  description = "Name of the primary S3 bucket"
  value       = aws_s3_bucket.primary.bucket
}

output "primary_s3_bucket_arn" {
  description = "ARN of the primary S3 bucket"
  value       = aws_s3_bucket.primary.arn
}

output "dr_s3_bucket_name" {
  description = "Name of the DR S3 bucket"
  value       = aws_s3_bucket.dr.bucket
}

output "dr_s3_bucket_arn" {
  description = "ARN of the DR S3 bucket"
  value       = aws_s3_bucket.dr.arn
}

output "s3_replication_role_arn" {
  description = "ARN of the S3 replication IAM role"
  value       = aws_iam_role.s3_replication.arn
}

output "primary_rds_instance_arn" {
  description = "ARN of the primary RDS instance"
  value       = var.enable_rds_replication ? aws_db_instance.primary[0].arn : ""
}

output "primary_rds_instance_endpoint" {
  description = "Endpoint of the primary RDS instance"
  value       = var.enable_rds_replication ? aws_db_instance.primary[0].endpoint : ""
}

output "dr_rds_instance_arn" {
  description = "ARN of the DR RDS instance"
  value       = var.enable_rds_replication ? aws_db_instance.dr_read_replica[0].arn : ""
}

output "dr_rds_instance_endpoint" {
  description = "Endpoint of the DR RDS instance"
  value       = var.enable_rds_replication ? aws_db_instance.dr_read_replica[0].endpoint : ""
}

output "primary_health_check_id" {
  description = "ID of the primary Route 53 health check"
  value       = aws_route53_health_check.primary.id
}

output "dr_health_check_id" {
  description = "ID of the DR Route 53 health check"
  value       = aws_route53_health_check.dr.id
}

output "primary_route53_record_fqdn" {
  description = "FQDN of the primary Route 53 record"
  value       = aws_route53_record.primary.fqdn
}

output "dr_route53_record_fqdn" {
  description = "FQDN of the DR Route 53 record"
  value       = aws_route53_record.dr.fqdn
}

output "s3_replication_lag_alarm_arn" {
  description = "ARN of the S3 replication lag alarm"
  value       = aws_cloudwatch_metric_alarm.s3_replication_lag.arn
}

output "rds_replication_lag_alarm_arns" {
  description = "ARNs of the RDS replication lag alarms"
  value       = var.enable_rds_replication ? [aws_cloudwatch_metric_alarm.rds_replication_lag[0].arn] : []
}

output "dr_sns_topic_arn" {
  description = "ARN of the DR SNS topic"
  value       = aws_sns_topic.dr_notifications.arn
}

output "failover_lambda_function_name" {
  description = "Name of the failover Lambda function"
  value       = aws_lambda_function.failover.function_name
}

output "failover_lambda_function_arn" {
  description = "ARN of the failover Lambda function"
  value       = aws_lambda_function.failover.arn
}

output "failover_event_rule_arn" {
  description = "ARN of the failover CloudWatch event rule"
  value       = aws_cloudwatch_event_rule.failover_trigger.arn
}

output "failover_lambda_log_group_name" {
  description = "Name of the failover Lambda log group"
  value       = aws_cloudwatch_log_group.failover_lambda.name
}