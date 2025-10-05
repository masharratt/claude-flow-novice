# Comprehensive Monitoring and Alerting Module
# Creates CloudWatch dashboards, alarms, and monitoring infrastructure

locals {
  name_prefix = var.name_prefix != "" ? var.name_prefix : "${var.project_name}-${var.environment}"
  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Owner       = "devops-team"
    Component   = "Monitoring"
  })
}

# SNS Topic for Alerts
resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"

  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.notification_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

resource "aws_sns_topic_subscription" "slack" {
  count     = var.slack_webhook_url != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "https"
  endpoint  = var.slack_webhook_url
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "application" {
  name              = "/aws/ec2/${local.name_prefix}-application"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "nginx" {
  name              = "/aws/ec2/${local.name_prefix}-nginx"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "system" {
  name              = "/aws/ec2/${local.name_prefix}-system"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "security" {
  name              = "/aws/ec2/${local.name_prefix}-security"
  retention_in_days = var.security_log_retention_days

  tags = local.common_tags
}

# IAM Role for CloudWatch Agent
resource "aws_iam_role" "cloudwatch_agent" {
  name = "${local.name_prefix}-cloudwatch-agent-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent_basic" {
  role       = aws_iam_role.cloudwatch_agent.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent_ssm" {
  role       = aws_iam_role.cloudwatch_agent.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "cloudwatch_agent" {
  name = "${local.name_prefix}-cloudwatch-agent-profile"
  role = aws_iam_role.cloudwatch_agent.name
}

# CloudWatch Alarms for EC2 Instances
resource "aws_cloudwatch_metric_alarm" "cpu_utilization_high" {
  alarm_name          = "${local.name_prefix}-cpu-utilization-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.cpu_high_evaluation_periods
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = var.cpu_period
  statistic           = "Average"
  threshold           = var.cpu_high_threshold
  alarm_description   = "This metric monitors ec2 cpu for high utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    AutoScalingGroupName = var.autoscaling_group_name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "cpu_utilization_low" {
  alarm_name          = "${local.name_prefix}-cpu-utilization-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = var.cpu_low_evaluation_periods
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = var.cpu_period
  statistic           = "Average"
  threshold           = var.cpu_low_threshold
  alarm_description   = "This metric monitors ec2 cpu for low utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    AutoScalingGroupName = var.autoscaling_group_name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "memory_utilization_high" {
  alarm_name          = "${local.name_prefix}-memory-utilization-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.memory_high_evaluation_periods
  metric_name         = "MemoryUtilization"
  namespace           = "CWAgent"
  period              = var.memory_period
  statistic           = "Average"
  threshold           = var.memory_high_threshold
  alarm_description   = "This metric monitors ec2 memory for high utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    AutoScalingGroupName = var.autoscaling_group_name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "disk_utilization_high" {
  alarm_name          = "${local.name_prefix}-disk-utilization-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.disk_high_evaluation_periods
  metric_name         = "disk_used_percent"
  namespace           = "CWAgent"
  period              = var.disk_period
  statistic           = "Average"
  threshold           = var.disk_high_threshold
  alarm_description   = "This metric monitors ec2 disk for high utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    AutoScalingGroupName = var.autoscaling_group_name
    device               = "xvda1"
    path                 = "/"
  }

  tags = local.common_tags
}

# CloudWatch Alarms for Application Metrics
resource "aws_cloudwatch_metric_alarm" "application_error_rate" {
  alarm_name          = "${local.name_prefix}-application-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.app_error_evaluation_periods
  metric_name         = "ApplicationErrors"
  namespace           = "ClaudeFlow/Application"
  period              = var.app_error_period
  statistic           = "Sum"
  threshold           = var.app_error_threshold
  alarm_description   = "This metric monitors application error rate"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    Environment = var.environment
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "application_response_time" {
  alarm_name          = "${local.name_prefix}-application-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.app_response_evaluation_periods
  metric_name         = "ApplicationResponseTime"
  namespace           = "ClaudeFlow/Application"
  period              = var.app_response_period
  statistic           = "Average"
  threshold           = var.app_response_threshold
  alarm_description   = "This metric monitors application response time"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    Environment = var.environment
  }

  tags = local.common_tags
}

# CloudWatch Alarms for Security Events
resource "aws_cloudwatch_metric_alarm" "security_events" {
  alarm_name          = "${local.name_prefix}-security-events"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.security_evaluation_periods
  metric_name         = "SecurityEvents"
  namespace           = "ClaudeFlow/Security"
  period              = var.security_period
  statistic           = "Sum"
  threshold           = var.security_threshold
  alarm_description   = "This metric monitors security events"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    Environment = var.environment
  }

  tags = local.common_tags
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.name_prefix}-main-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/EC2", "CPUUtilization", "AutoScalingGroupName", var.autoscaling_group_name],
            [".", ".", ".", ".", { "label": "CPU Utilization" }],
            ["CWAgent", "MemoryUtilization", "AutoScalingGroupName", var.autoscaling_group_name],
            [".", ".", ".", ".", { "label": "Memory Utilization" }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "Instance Metrics"
          yAxis  = {
            left = {
              min = 0
              max = 100
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix],
            [".", ".", ".", ".", { "label": "ALB Response Time" }],
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix],
            [".", ".", ".", ".", { "label": "Request Count" }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "Load Balancer Metrics"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["ClaudeFlow/Application", "ApplicationErrors", "Environment", var.environment],
            [".", ".", ".", ".", { "label": "Application Errors" }],
            ["ClaudeFlow/Application", "ApplicationResponseTime", "Environment", var.environment],
            [".", ".", ".", ".", { "label": "Response Time" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "Application Metrics"
        }
      },
      {
        type   = "log"
        x      = 12
        y      = 6
        width  = 12
        height = 6

        properties = {
          query   = "SOURCE '${aws_cloudwatch_log_group.application.name}' | fields @timestamp, @message | sort @timestamp desc | limit 100"
          region  = var.aws_region
          title   = "Application Logs"
          view    = "table"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/AutoScaling", "GroupInServiceInstances", "AutoScalingGroupName", var.autoscaling_group_name],
            [".", ".", ".", ".", { "label": "In Service" }],
            ["AWS/AutoScaling", "GroupPendingInstances", "AutoScalingGroupName", var.autoscaling_group_name],
            [".", ".", ".", ".", { "label": "Pending" }],
            ["AWS/AutoScaling", "GroupTerminatingInstances", "AutoScalingGroupName", var.autoscaling_group_name],
            [".", ".", ".", ".", { "label": "Terminating" }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "Auto Scaling Group"
          yAxis  = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["CWAgent", "disk_used_percent", "AutoScalingGroupName", var.autoscaling_group_name, "device", "xvda1", "path", "/"],
            [".", ".", ".", ".", ".", ".", ".", { "label": "Disk Usage" }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "Disk Utilization"
          yAxis  = {
            left = {
              min = 0
              max = 100
            }
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

# CloudWatch Metric Streams
resource "aws_cloudwatch_metric_stream" "main" {
  count         = var.enable_metric_streams ? 1 : 0
  name          = "${local.name_prefix}-metric-stream"
  firehose_arn  = aws_kinesis_firehose_delivery_stream.metrics[0].arn
  role_arn      = aws_iam_role.metric_stream[0].arn
  output_format = "json"

  include_filter {
    namespace = "AWS/EC2"
  }

  include_filter {
    namespace = "AWS/ApplicationELB"
  }

  include_filter {
    namespace = "AWS/AutoScaling"
  }

  include_filter {
    namespace = "CWAgent"
  }

  tags = local.common_tags
}

# Kinesis Firehose for Metric Streams
resource "aws_kinesis_firehose_delivery_stream" "metrics" {
  count       = var.enable_metric_streams ? 1 : 0
  name        = "${local.name_prefix}-metrics-stream"
  destination = "extended_s3"

  extended_s3_configuration {
    bucket_arn = aws_s3_bucket.metrics[0].arn
    prefix     = "metrics/"
    error_output_prefix = "metrics-errors/"

    buffer_size     = 5
    buffer_interval = 300

    compression_format = "GZIP"
  }

  tags = local.common_tags
}

# S3 Bucket for Metrics
resource "aws_s3_bucket" "metrics" {
  count         = var.enable_metric_streams ? 1 : 0
  bucket        = "${local.name_prefix}-metrics-${random_string.metrics_suffix[0].result}"
  force_destroy = true

  tags = local.common_tags
}

resource "random_string" "metrics_suffix" {
  count   = var.enable_metric_streams ? 1 : 0
  length  = 8
  special = false
  upper   = false
}

# IAM Role for Metric Streams
resource "aws_iam_role" "metric_stream" {
  count = var.enable_metric_streams ? 1 : 0
  name  = "${local.name_prefix}-metric-stream-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "streams.metrics.cloudwatch.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "metric_stream" {
  count = var.enable_metric_streams ? 1 : 0
  name  = "${local.name_prefix}-metric-stream-policy"
  role  = aws_iam_role.metric_stream[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "firehose:PutRecord",
          "firehose:PutRecordBatch"
        ]
        Resource = aws_kinesis_firehose_delivery_stream.metrics[0].arn
      }
    ]
  })
}

# CloudWatch Log Insights Queries
resource "aws_cloudwatch_log_query_definition" "error_analysis" {
  name = "${local.name_prefix}-error-analysis"

  log_group_names = [
    aws_cloudwatch_log_group.application.name
  ]

  query_string = <<-EOT
    fields @timestamp, @message
    | filter @message like /ERROR|WARN|CRITICAL/
    | stats count() by bin(5m)
    | sort @timestamp desc
  EOT
}

resource "aws_cloudwatch_log_query_definition" "security_analysis" {
  name = "${local.name_prefix}-security-analysis"

  log_group_names = [
    aws_cloudwatch_log_group.security.name
  ]

  query_string = <<-EOT
    fields @timestamp, @message
    | filter @message like /authentication|authorization|login|failed|denied/
    | stats count() by @message
    | sort @timestamp desc
    | limit 100
  EOT
}

resource "aws_cloudwatch_log_query_definition" "performance_analysis" {
  name = "${local.name_prefix}-performance-analysis"

  log_group_names = [
    aws_cloudwatch_log_group.application.name
  ]

  query_string = <<-EOT
    fields @timestamp, @message
    | filter @message like /slow|timeout|latency|performance/
    | stats count() by bin(10m)
    | sort @timestamp desc
  EOT
}