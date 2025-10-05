output "load_balancer_arn" {
  description = "ARN of the load balancer"
  value       = aws_lb.dashboard.arn
}

output "load_balancer_dns_name" {
  description = "DNS name of the load balancer"
  value       = aws_lb.dashboard.dns_name
}

output "load_balancer_zone_id" {
  description = "Zone ID of the load balancer"
  value       = aws_lb.dashboard.zone_id
}

output "load_balancer_arn_suffix" {
  description = "ARN suffix of the load balancer"
  value       = aws_lb.dashboard.arn_suffix
}

output "target_group_arn" {
  description = "ARN of the target group"
  value       = aws_lb_target_group.dashboard.arn
}

output "target_group_arn_suffix" {
  description = "ARN suffix of the target group"
  value       = aws_lb_target_group.dashboard.arn_suffix
}

output "target_group_name" {
  description = "Name of the target group"
  value       = aws_lb_target_group.dashboard.name
}

output "http_listener_arn" {
  description = "ARN of the HTTP listener"
  value       = var.enable_https ? aws_lb_listener.dashboard_http[0].arn : ""
}

output "https_listener_arn" {
  description = "ARN of the HTTPS listener"
  value       = aws_lb_listener.dashboard_https.arn
}

output "alb_5xx_error_alarm_arn" {
  description = "ARN of the ALB 5XX error alarm"
  value       = aws_cloudwatch_metric_alarm.alb_5xx_error_rate.arn
}

output "alb_4xx_error_alarm_arn" {
  description = "ARN of the ALB 4XX error alarm"
  value       = aws_cloudwatch_metric_alarm.alb_4xx_error_rate.arn
}

output "alb_response_time_alarm_arn" {
  description = "ARN of the ALB response time alarm"
  value       = aws_cloudwatch_metric_alarm.alb_response_time.arn
}

output "alb_unhealthy_hosts_alarm_arn" {
  description = "ARN of the ALB unhealthy hosts alarm"
  value       = aws_cloudwatch_metric_alarm.alb_unhealthy_hosts.arn
}

output "alb_connection_errors_alarm_arn" {
  description = "ARN of the ALB connection errors alarm"
  value       = aws_cloudwatch_metric_alarm.alb_target_connection_errors.arn
}

output "access_logs_bucket_name" {
  description = "Name of the access logs S3 bucket"
  value       = var.access_logs_bucket != "" ? var.access_logs_bucket : (var.enable_access_logs ? aws_s3_bucket.alb_access_logs[0].bucket : "")
}

output "alb_access_logs_log_group_arn" {
  description = "ARN of the ALB access logs CloudWatch log group"
  value       = var.enable_access_logs && var.create_log_group ? aws_cloudwatch_log_group.alb_access_logs[0].arn : ""
}

output "route53_record_name" {
  description = "Name of the Route 53 record"
  value       = var.domain_name != "" ? aws_route53_record.dashboard[0].name : ""
}

output "route53_record_fqdn" {
  description = "FQDN of the Route 53 record"
  value       = var.domain_name != "" ? aws_route53_record.dashboard[0].fqdn : ""
}