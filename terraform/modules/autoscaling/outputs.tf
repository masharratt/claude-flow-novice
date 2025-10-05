output "autoscaling_group_name" {
  description = "Name of the Auto Scaling Group"
  value       = aws_autoscaling_group.dashboard.name
}

output "autoscaling_group_arn" {
  description = "ARN of the Auto Scaling Group"
  value       = aws_autoscaling_group.dashboard.arn
}

output "launch_template_id" {
  description = "ID of the Launch Template"
  value       = aws_launch_template.dashboard.id
}

output "launch_template_latest_version" {
  description = "Latest version of the Launch Template"
  value       = aws_launch_template.dashboard.latest_version
}

output "scale_out_cpu_policy_arn" {
  description = "ARN of the CPU scale-out policy"
  value       = aws_autoscaling_policy.scale_out_cpu.arn
}

output "scale_in_cpu_policy_arn" {
  description = "ARN of the CPU scale-in policy"
  value       = aws_autoscaling_policy.scale_in_cpu.arn
}

output "scale_out_memory_policy_arn" {
  description = "ARN of the memory scale-out policy"
  value       = aws_autoscaling_policy.scale_out_memory.arn
}

output "scale_in_memory_policy_arn" {
  description = "ARN of the memory scale-in policy"
  value       = aws_autoscaling_policy.scale_in_memory.arn
}

output "scale_out_requests_policy_arn" {
  description = "ARN of the requests scale-out policy"
  value       = aws_autoscaling_policy.scale_out_requests.arn
}

output "scale_in_requests_policy_arn" {
  description = "ARN of the requests scale-in policy"
  value       = aws_autoscaling_policy.scale_in_requests.arn
}

output "cpu_high_alarm_arn" {
  description = "ARN of the CPU high alarm"
  value       = aws_cloudwatch_metric_alarm.cpu_high.arn
}

output "cpu_low_alarm_arn" {
  description = "ARN of the CPU low alarm"
  value       = aws_cloudwatch_metric_alarm.cpu_low.arn
}

output "memory_high_alarm_arns" {
  description = "ARNs of the memory high alarms"
  value       = var.enable_memory_monitoring ? [aws_cloudwatch_metric_alarm.memory_high[0].arn] : []
}

output "memory_low_alarm_arns" {
  description = "ARNs of the memory low alarms"
  value       = var.enable_memory_monitoring ? [aws_cloudwatch_metric_alarm.memory_low[0].arn] : []
}

output "requests_high_alarm_arns" {
  description = "ARNs of the requests high alarms"
  value       = var.enable_request_monitoring && var.alb_target_group_arn != "" ? [aws_cloudwatch_metric_alarm.requests_high[0].arn] : []
}

output "requests_low_alarm_arns" {
  description = "ARNs of the requests low alarms"
  value       = var.enable_request_monitoring && var.alb_target_group_arn != "" ? [aws_cloudwatch_metric_alarm.requests_low[0].arn] : []
}

output "lifecycle_hook_launch_arns" {
  description = "ARNs of the instance launch lifecycle hooks"
  value       = var.enable_lifecycle_hooks ? [aws_autoscaling_lifecycle_hook.instance_launch[0].arn] : []
}

output "lifecycle_hook_terminate_arns" {
  description = "ARNs of the instance terminate lifecycle hooks"
  value       = var.enable_lifecycle_hooks ? [aws_autoscaling_lifecycle_hook.instance_terminate[0].arn] : []
}

output "scheduled_scale_up_arns" {
  description = "ARNs of the scheduled scale-up actions"
  value       = var.enable_scheduled_scaling ? [aws_autoscaling_schedule.scale_up_business_hours[0].arn] : []
}

output "scheduled_scale_down_arns" {
  description = "ARNs of the scheduled scale-down actions"
  value       = var.enable_scheduled_scaling ? [aws_autoscaling_schedule.scale_down_off_hours[0].arn] : []
}