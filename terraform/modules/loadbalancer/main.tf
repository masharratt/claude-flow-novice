# Application Load Balancer Module for Dashboard Services
# Creates comprehensive ALB with health checks, SSL, and WAF integration

locals {
  name_prefix = var.name_prefix != "" ? var.name_prefix : "${var.project_name}-${var.environment}"
  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Owner       = "devops-team"
    Component   = "ApplicationLoadBalancer"
  })
}

# Application Load Balancer
resource "aws_lb" "dashboard" {
  name               = "${local.name_prefix}-dashboard-alb"
  internal           = var.internal
  load_balancer_type = "application"
  security_groups    = var.security_group_ids
  subnets            = var.subnet_ids

  enable_deletion_protection = var.enable_deletion_protection

  # Access Logs
  access_logs {
    bucket  = var.access_logs_bucket
    prefix  = "${local.name_prefix}-alb-logs"
    enabled = var.enable_access_logs
  }

  # Connection Draining
  connection_logs {
    bucket  = var.connection_logs_bucket
    prefix  = "${local.name_prefix}-alb-connection-logs"
    enabled = var.enable_connection_logs
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-dashboard-alb"
    }
  )
}

# Target Group for Dashboard Services
resource "aws_lb_target_group" "dashboard" {
  name     = "${local.name_prefix}-dashboard-tg"
  port     = var.target_port
  protocol = var.target_protocol
  vpc_id   = var.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = var.healthy_threshold
    interval            = var.health_check_interval
    matcher             = var.health_check_matcher
    path                = var.health_check_path
    port                = var.health_check_port
    protocol            = var.health_check_protocol
    timeout             = var.health_check_timeout
    unhealthy_threshold = var.unhealthy_threshold
  }

  deregistration_delay = var.deregistration_delay

  target_type = var.target_type

  stickiness {
    enabled    = var.enable_stickiness
    type       = "lb_cookie"
    cookie_duration = var.cookie_duration
  }

  protocol_version = var.protocol_version

  tags = local.common_tags
}

# HTTP Listener (redirects to HTTPS)
resource "aws_lb_listener" "dashboard_http" {
  count             = var.enable_https ? 1 : 0
  load_balancer_arn = aws_lb.dashboard.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = 443
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = local.common_tags
}

# HTTPS Listener
resource "aws_lb_listener" "dashboard_https" {
  load_balancer_arn = aws_lb.dashboard.arn
  port              = var.enable_https ? 443 : 80
  protocol          = var.enable_https ? "HTTPS" : "HTTP"
  ssl_policy        = var.enable_https ? var.ssl_policy : null
  certificate_arn   = var.enable_https ? var.certificate_arn : null

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dashboard.arn
  }

  tags = local.common_tags
}

# WAF Web ACL Association
resource "aws_wafv2_web_acl_association" "dashboard" {
  count         = var.enable_waf ? 1 : 0
  resource_arn  = aws_lb.dashboard.arn
  web_acl_arn   = var.waf_web_acl_arn
}

# CloudWatch Alarms for ALB
resource "aws_cloudwatch_metric_alarm" "alb_5xx_error_rate" {
  alarm_name          = "${local.name_prefix}-alb-5xx-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.alb_error_evaluation_periods
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = var.alb_error_period
  statistic           = "Sum"
  threshold           = var.alb_5xx_error_threshold
  alarm_description   = "This metric monitors ALB 5XX error rate"
  alarm_actions       = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.dashboard.arn_suffix
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "alb_4xx_error_rate" {
  alarm_name          = "${local.name_prefix}-alb-4xx-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.alb_error_evaluation_periods
  metric_name         = "HTTPCode_Target_4XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = var.alb_error_period
  statistic           = "Sum"
  threshold           = var.alb_4xx_error_threshold
  alarm_description   = "This metric monitors ALB 4XX error rate"
  alarm_actions       = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.dashboard.arn_suffix
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "alb_response_time" {
  alarm_name          = "${local.name_prefix}-alb-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.alb_response_evaluation_periods
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = var.alb_response_period
  statistic           = "Average"
  threshold           = var.alb_response_time_threshold
  alarm_description   = "This metric monitors ALB response time"
  alarm_actions       = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.dashboard.arn_suffix
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  alarm_name          = "${local.name_prefix}-alb-unhealthy-hosts"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.alb_health_evaluation_periods
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = var.alb_health_period
  statistic           = "Average"
  threshold           = var.alb_unhealthy_hosts_threshold
  alarm_description   = "This metric monitors ALB unhealthy host count"
  alarm_actions       = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.dashboard.arn_suffix
    TargetGroup  = aws_lb_target_group.dashboard.arn_suffix
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "alb_target_connection_errors" {
  alarm_name          = "${local.name_prefix}-alb-target-connection-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.alb_connection_evaluation_periods
  metric_name         = "TargetConnectionErrorCount"
  namespace           = "AWS/ApplicationELB"
  period              = var.alb_connection_period
  statistic           = "Sum"
  threshold           = var.alb_connection_error_threshold
  alarm_description   = "This metric monitors ALB target connection errors"
  alarm_actions       = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.dashboard.arn_suffix
  }

  tags = local.common_tags
}

# CloudWatch Log Group for ALB Access Logs
resource "aws_cloudwatch_log_group" "alb_access_logs" {
  count             = var.enable_access_logs && var.create_log_group ? 1 : 0
  name              = "/aws/elb/${local.name_prefix}-dashboard-alb"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

# S3 Bucket for ALB Access Logs (if not provided)
resource "aws_s3_bucket" "alb_access_logs" {
  count         = var.enable_access_logs && var.access_logs_bucket == "" ? 1 : 0
  bucket        = "${local.name_prefix}-alb-access-logs-${random_string.suffix.result}"
  force_destroy = true

  tags = local.common_tags
}

resource "aws_s3_bucket_versioning" "alb_access_logs" {
  count  = var.enable_access_logs && var.access_logs_bucket == "" ? 1 : 0
  bucket = aws_s3_bucket.alb_access_logs[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "alb_access_logs" {
  count  = var.enable_access_logs && var.access_logs_bucket == "" ? 1 : 0
  bucket = aws_s3_bucket.alb_access_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "alb_access_logs" {
  count  = var.enable_access_logs && var.access_logs_bucket == "" ? 1 : 0
  bucket = aws_s3_bucket.alb_access_logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Random suffix for S3 bucket naming
resource "random_string" "suffix" {
  count   = var.enable_access_logs && var.access_logs_bucket == "" ? 1 : 0
  length  = 8
  special = false
  upper   = false
}

# S3 Bucket Policy for ALB Access Logs
resource "aws_s3_bucket_policy" "alb_access_logs" {
  count  = var.enable_access_logs ? 1 : 0
  bucket = var.access_logs_bucket != "" ? var.access_logs_bucket : aws_s3_bucket.alb_access_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::127311923021:root"  # ELB account ID for logs delivery
        }
        Action = "s3:PutObject"
        Resource = [
          "${var.access_logs_bucket != "" ? var.access_logs_bucket : aws_s3_bucket.alb_access_logs[0].arn}/*",
          "${var.access_logs_bucket != "" ? var.access_logs_bucket : aws_s3_bucket.alb_access_logs[0].arn}/*/*"
        ]
      },
      {
        Effect = "Allow"
        Principal = {
          Service = "delivery.logs.amazonaws.com"
        }
        Action = "s3:PutObject"
        Resource = [
          "${var.access_logs_bucket != "" ? var.access_logs_bucket : aws_s3_bucket.alb_access_logs[0].arn}/*",
          "${var.access_logs_bucket != "" ? var.access_logs_bucket : aws_s3_bucket.alb_access_logs[0].arn}/*/*"
        ]
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      },
      {
        Effect = "Allow"
        Principal = {
          Service = "delivery.logs.amazonaws.com"
        }
        Action = "s3:GetBucketAcl"
        Resource = var.access_logs_bucket != "" ? var.access_logs_bucket : aws_s3_bucket.alb_access_logs[0].arn
      }
    ]
  })
}

# Route 53 Record (if domain is provided)
resource "aws_route53_record" "dashboard" {
  count   = var.domain_name != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.dashboard.dns_name
    zone_id               = aws_lb.dashboard.zone_id
    evaluate_target_health = true
  }
}