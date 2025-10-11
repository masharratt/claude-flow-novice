output "alerts_sns_topic_arn" {
  description = "ARN of the alerts SNS topic"
  value       = aws_sns_topic.alerts.arn
}

output "application_log_group_name" {
  description = "Name of the application log group"
  value       = aws_cloudwatch_log_group.application.name
}

output "nginx_log_group_name" {
  description = "Name of the nginx log group"
  value       = aws_cloudwatch_log_group.nginx.name
}

output "system_log_group_name" {
  description = "Name of the system log group"
  value       = aws_cloudwatch_log_group.system.name
}

output "security_log_group_name" {
  description = "Name of the security log group"
  value       = aws_cloudwatch_log_group.security.name
}

output "cloudwatch_agent_role_arn" {
  description = "ARN of the CloudWatch agent IAM role"
  value       = aws_iam_role.cloudwatch_agent.arn
}

output "cloudwatch_agent_instance_profile_name" {
  description = "Name of the CloudWatch agent instance profile"
  value       = aws_iam_instance_profile.cloudwatch_agent.name
}

output "cpu_high_alarm_arn" {
  description = "ARN of the CPU high alarm"
  value       = aws_cloudwatch_metric_alarm.cpu_utilization_high.arn
}

output "cpu_low_alarm_arn" {
  description = "ARN of the CPU low alarm"
  value       = aws_cloudwatch_metric_alarm.cpu_utilization_low.arn
}

output "memory_high_alarm_arn" {
  description = "ARN of the memory high alarm"
  value       = aws_cloudwatch_metric_alarm.memory_utilization_high.arn
}

output "disk_high_alarm_arn" {
  description = "ARN of the disk high alarm"
  value       = aws_cloudwatch_metric_alarm.disk_utilization_high.arn
}

output "application_error_alarm_arn" {
  description = "ARN of the application error alarm"
  value       = aws_cloudwatch_metric_alarm.application_error_rate.arn
}

output "application_response_alarm_arn" {
  description = "ARN of the application response time alarm"
  value       = aws_cloudwatch_metric_alarm.application_response_time.arn
}

output "security_events_alarm_arn" {
  description = "ARN of the security events alarm"
  value       = aws_cloudwatch_metric_alarm.security_events.arn
}

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

output "dashboard_url" {
  description = "URL of the CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}

output "metric_stream_arns" {
  description = "ARNs of the metric streams"
  value       = var.enable_metric_streams ? [aws_cloudwatch_metric_stream.main[0].arn] : []
}

output "metrics_bucket_names" {
  description = "Names of the metrics S3 buckets"
  value       = var.enable_metric_streams ? [aws_s3_bucket.metrics[0].bucket] : []
}

output "log_query_definition_names" {
  description = "Names of the log query definitions"
  value       = [
    aws_cloudwatch_log_query_definition.error_analysis.name,
    aws_cloudwatch_log_query_definition.security_analysis.name,
    aws_cloudwatch_log_query_definition.performance_analysis.name
  ]
}