# Auto Scaling Group Module for Dashboard Services
# Creates comprehensive auto-scaling infrastructure with health checks and lifecycle management

locals {
  name_prefix = var.name_prefix != "" ? var.name_prefix : "${var.project_name}-${var.environment}"
  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Owner       = "devops-team"
    Component   = "AutoScalingGroup"
  })
}

# Launch Template for Auto Scaling Group
resource "aws_launch_template" "dashboard" {
  name_prefix   = "${local.name_prefix}-dashboard-"
  description   = "Launch template for dashboard services"
  image_id      = var.ami_id != "" ? var.ami_id : data.aws_ami.amazon_linux_2.id
  instance_type = var.instance_type
  key_name      = var.key_name

  vpc_security_group_ids = var.security_group_ids
  user_data              = base64encode(var.user_data)

  monitoring {
    enabled = var.enable_detailed_monitoring
  }

  iam_instance_profile {
    name = var.iam_instance_profile_name
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(
      local.common_tags,
      {
        Name = "${local.name_prefix}-dashboard-instance"
      }
    )
  }

  tag_specifications {
    resource_type = "volume"
    tags = merge(
      local.common_tags,
      {
        Name = "${local.name_prefix}-dashboard-volume"
      }
    )
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = var.root_volume_size
      volume_type           = var.root_volume_type
      delete_on_termination = true
      encrypted             = true
      kms_key_id            = var.kms_key_id
    }
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
    http_put_response_hop_limit = 1
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Auto Scaling Group
resource "aws_autoscaling_group" "dashboard" {
  name                = "${local.name_prefix}-dashboard-asg"
  vpc_zone_identifier = var.subnet_ids
  desired_capacity    = var.desired_capacity
  max_size            = var.max_size
  min_size            = var.min_size
  target_group_arns   = var.target_group_arns
  health_check_type   = "EC2"
  health_check_grace_period = var.health_check_grace_period

  launch_template {
    id      = aws_launch_template.dashboard.id
    version = "$Latest"
  }

  enabled_metrics = [
    "GroupMinSize",
    "GroupMaxSize",
    "GroupDesiredCapacity",
    "GroupInServiceInstances",
    "GroupPendingInstances",
    "GroupStandbyInstances",
    "GroupTerminatingInstances",
    "GroupTotalInstances"
  ]

  metrics_granularity = "1Minute"

  tag {
    key                 = "Name"
    value               = "${local.name_prefix}-dashboard-asg"
    propagate_at_launch = true
  }

  dynamic "tag" {
    for_each = local.common_tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  lifecycle {
    ignore_changes        = [target_group_arns]
    create_before_destroy = true
  }
}

# Auto Scaling Policies - Scale Out
resource "aws_autoscaling_policy" "scale_out_cpu" {
  name                   = "${local.name_prefix}-scale-out-cpu"
  scaling_adjustment     = var.scale_out_adjustment
  adjustment_type        = "ChangeInCapacity"
  cooldown               = var.scale_out_cooldown
  autoscaling_group_name = aws_autoscaling_group.dashboard.name
}

resource "aws_autoscaling_policy" "scale_out_memory" {
  name                   = "${local.name_prefix}-scale-out-memory"
  scaling_adjustment     = var.scale_out_adjustment
  adjustment_type        = "ChangeInCapacity"
  cooldown               = var.scale_out_cooldown
  autoscaling_group_name = aws_autoscaling_group.dashboard.name
}

resource "aws_autoscaling_policy" "scale_out_requests" {
  name                   = "${local.name_prefix}-scale-out-requests"
  scaling_adjustment     = var.scale_out_adjustment
  adjustment_type        = "ChangeInCapacity"
  cooldown               = var.scale_out_cooldown
  autoscaling_group_name = aws_autoscaling_group.dashboard.name
}

# Auto Scaling Policies - Scale In
resource "aws_autoscaling_policy" "scale_in_cpu" {
  name                   = "${local.name_prefix}-scale-in-cpu"
  scaling_adjustment     = var.scale_in_adjustment
  adjustment_type        = "ChangeInCapacity"
  cooldown               = var.scale_in_cooldown
  autoscaling_group_name = aws_autoscaling_group.dashboard.name
}

resource "aws_autoscaling_policy" "scale_in_memory" {
  name                   = "${local.name_prefix}-scale-in-memory"
  scaling_adjustment     = var.scale_in_adjustment
  adjustment_type        = "ChangeInCapacity"
  cooldown               = var.scale_in_cooldown
  autoscaling_group_name = aws_autoscaling_group.dashboard.name
}

resource "aws_autoscaling_policy" "scale_in_requests" {
  name                   = "${local.name_prefix}-scale-in-requests"
  scaling_adjustment     = var.scale_in_adjustment
  adjustment_type        = "ChangeInCapacity"
  cooldown               = var.scale_in_cooldown
  autoscaling_group_name = aws_autoscaling_group.dashboard.name
}

# CloudWatch Alarms for CPU Utilization
resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "${local.name_prefix}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.cpu_high_evaluation_periods
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = var.cpu_high_period
  statistic           = "Average"
  threshold           = var.cpu_high_threshold
  alarm_description   = "This metric monitors ec2 cpu for high utilization"
  alarm_actions       = [aws_autoscaling_policy.scale_out_cpu.arn]
  ok_actions          = [aws_autoscaling_policy.scale_in_cpu.arn]

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.dashboard.name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "cpu_low" {
  alarm_name          = "${local.name_prefix}-cpu-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = var.cpu_low_evaluation_periods
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = var.cpu_low_period
  statistic           = "Average"
  threshold           = var.cpu_low_threshold
  alarm_description   = "This metric monitors ec2 cpu for low utilization"
  alarm_actions       = [aws_autoscaling_policy.scale_in_cpu.arn]
  ok_actions          = [aws_autoscaling_policy.scale_out_cpu.arn]

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.dashboard.name
  }

  tags = local.common_tags
}

# CloudWatch Alarms for Memory Utilization
resource "aws_cloudwatch_metric_alarm" "memory_high" {
  count               = var.enable_memory_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.memory_high_evaluation_periods
  metric_name         = "MemoryUtilization"
  namespace           = "CWAgent"
  period              = var.memory_high_period
  statistic           = "Average"
  threshold           = var.memory_high_threshold
  alarm_description   = "This metric monitors ec2 memory for high utilization"
  alarm_actions       = [aws_autoscaling_policy.scale_out_memory[0].arn]
  ok_actions          = [aws_autoscaling_policy.scale_in_memory[0].arn]

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.dashboard.name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "memory_low" {
  count               = var.enable_memory_monitoring ? 1 : 0
  alarm_name          = "${local.name_prefix}-memory-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = var.memory_low_evaluation_periods
  metric_name         = "MemoryUtilization"
  namespace           = "CWAgent"
  period              = var.memory_low_period
  statistic           = "Average"
  threshold           = var.memory_low_threshold
  alarm_description   = "This metric monitors ec2 memory for low utilization"
  alarm_actions       = [aws_autoscaling_policy.scale_in_memory[0].arn]
  ok_actions          = [aws_autoscaling_policy.scale_out_memory[0].arn]

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.dashboard.name
  }

  tags = local.common_tags
}

# CloudWatch Alarms for Request Count
resource "aws_cloudwatch_metric_alarm" "requests_high" {
  count               = var.enable_request_monitoring && var.alb_target_group_arn != "" ? 1 : 0
  alarm_name          = "${local.name_prefix}-requests-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.requests_high_evaluation_periods
  metric_name         = "RequestCount"
  namespace           = "AWS/ApplicationELB"
  period              = var.requests_high_period
  statistic           = "Sum"
  threshold           = var.requests_high_threshold
  alarm_description   = "This metric monitors ALB request count for high traffic"
  alarm_actions       = [aws_autoscaling_policy.scale_out_requests[0].arn]
  ok_actions          = [aws_autoscaling_policy.scale_in_requests[0].arn]

  dimensions = {
    TargetGroup = var.alb_target_group_arn
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "requests_low" {
  count               = var.enable_request_monitoring && var.alb_target_group_arn != "" ? 1 : 0
  alarm_name          = "${local.name_prefix}-requests-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = var.requests_low_evaluation_periods
  metric_name         = "RequestCount"
  namespace           = "AWS/ApplicationELB"
  period              = var.requests_low_period
  statistic           = "Sum"
  threshold           = var.requests_low_threshold
  alarm_description   = "This metric monitors ALB request count for low traffic"
  alarm_actions       = [aws_autoscaling_policy.scale_in_requests[0].arn]
  ok_actions          = [aws_autoscaling_policy.scale_out_requests[0].arn]

  dimensions = {
    TargetGroup = var.alb_target_group_arn
  }

  tags = local.common_tags
}

# Lifecycle Hook for Instance Launch
resource "aws_autoscaling_lifecycle_hook" "instance_launch" {
  count                  = var.enable_lifecycle_hooks ? 1 : 0
  name                   = "${local.name_prefix}-instance-launch"
  autoscaling_group_name = aws_autoscaling_group.dashboard.name
  default_result         = "CONTINUE"
  heartbeat_timeout      = var.lifecycle_heartbeat_timeout
  lifecycle_transition   = "autoscaling:EC2_INSTANCE_LAUNCHING"
  notification_target_arn = var.lifecycle_notification_arn

  depends_on = [aws_autoscaling_group.dashboard]
}

# Lifecycle Hook for Instance Terminate
resource "aws_autoscaling_lifecycle_hook" "instance_terminate" {
  count                  = var.enable_lifecycle_hooks ? 1 : 0
  name                   = "${local.name_prefix}-instance-terminate"
  autoscaling_group_name = aws_autoscaling_group.dashboard.name
  default_result         = "CONTINUE"
  heartbeat_timeout      = var.lifecycle_heartbeat_timeout
  lifecycle_transition   = "autoscaling:EC2_INSTANCE_TERMINATING"
  notification_target_arn = var.lifecycle_notification_arn

  depends_on = [aws_autoscaling_group.dashboard]
}

# Scheduled Scaling
resource "aws_autoscaling_schedule" "scale_up_business_hours" {
  count                 = var.enable_scheduled_scaling ? 1 : 0
  scheduled_action_name = "${local.name_prefix}-scale-up-business-hours"
  autoscaling_group_name = aws_autoscaling_group.dashboard.name
  min_size              = var.business_hours_min_size
  max_size              = var.business_hours_max_size
  desired_capacity      = var.business_hours_desired_capacity
  recurrence            = var.business_hours_schedule
  start_time            = timeadd(timestamp(), "5m")
}

resource "aws_autoscaling_schedule" "scale_down_off_hours" {
  count                 = var.enable_scheduled_scaling ? 1 : 0
  scheduled_action_name = "${local.name_prefix}-scale-down-off-hours"
  autoscaling_group_name = aws_autoscaling_group.dashboard.name
  min_size              = var.off_hours_min_size
  max_size              = var.off_hours_max_size
  desired_capacity      = var.off_hours_desired_capacity
  recurrence            = var.off_hours_schedule
  start_time            = timeadd(timestamp(), "5m")
}

# Data source for latest Amazon Linux 2 AMI
data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}