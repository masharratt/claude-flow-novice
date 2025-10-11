# Disaster Recovery Module for Cross-Region Infrastructure
# Creates comprehensive disaster recovery with replication, failover, and backup systems

# Provider configuration for disaster recovery region
provider "aws" {
  alias  = "dr"
  region = var.dr_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = "${var.environment}-dr"
      ManagedBy   = "Terraform"
      Owner       = "devops-team"
    }
  }
}

locals {
  name_prefix = var.name_prefix != "" ? var.name_prefix : "${var.project_name}-${var.environment}"
  dr_name_prefix = "${local.name_prefix}-dr"
  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Owner       = "devops-team"
    Component   = "DisasterRecovery"
  })
}

# S3 Bucket for Cross-Region Replication
resource "aws_s3_bucket" "primary" {
  bucket        = "${local.name_prefix}-primary-backups"
  force_destroy = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-primary-backups"
    }
  )
}

resource "aws_s3_bucket_versioning" "primary" {
  bucket = aws_s3_bucket.primary.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "primary" {
  bucket = aws_s3_bucket.primary.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "primary" {
  bucket = aws_s3_bucket.primary.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "primary" {
  bucket = aws_s3_bucket.primary.id

  rule {
    id     = "backup_lifecycle"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    transition {
      days          = 365
      storage_class = "DEEP_ARCHIVE"
    }

    expiration {
      days = var.backup_retention_days
    }
  }
}

# DR Region S3 Bucket
resource "aws_s3_bucket" "dr" {
  provider      = aws.dr
  bucket        = "${local.dr_name_prefix}-replicated-backups"
  force_destroy = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.dr_name_prefix}-replicated-backups"
      Environment = "${var.environment}-dr"
    }
  )
}

resource "aws_s3_bucket_versioning" "dr" {
  provider = aws.dr
  bucket   = aws_s3_bucket.dr.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "dr" {
  provider = aws.dr
  bucket   = aws_s3_bucket.dr.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "dr" {
  provider = aws.dr
  bucket   = aws_s3_bucket.dr.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 Replication Configuration
resource "aws_s3_bucket_replication_configuration" "primary_to_dr" {
  role   = aws_iam_role.s3_replication.arn
  bucket = aws_s3_bucket.primary.id

  rule {
    id     = "primary_to_dr_replication"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.dr.arn
      storage_class = "STANDARD"
    }

    delete_marker_replication {
      status = "Enabled"
    }
  }
}

# IAM Role for S3 Replication
resource "aws_iam_role" "s3_replication" {
  name = "${local.name_prefix}-s3-replication-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "s3_replication" {
  name = "${local.name_prefix}-s3-replication-policy"
  role = aws_iam_role.s3_replication.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetReplicationConfiguration",
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl",
          "s3:GetObjectVersionTagging"
        ]
        Resource = [
          aws_s3_bucket.primary.arn,
          "${aws_s3_bucket.primary.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete",
          "s3:ReplicateTags"
        ]
        Resource = [
          aws_s3_bucket.dr.arn,
          "${aws_s3_bucket.dr.arn}/*"
        ]
      }
    ]
  })
}

# RDS Cross-Region Read Replica (if RDS is enabled)
resource "aws_db_instance" "primary" {
  count = var.enable_rds_replication ? 1 : 0

  identifier = "${local.name_prefix}-primary-db"

  engine         = var.rds_engine
  engine_version = var.rds_engine_version
  instance_class = var.rds_instance_class

  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  storage_type          = "gp2"
  storage_encrypted     = true
  kms_key_id            = var.rds_kms_key_id

  db_name  = var.rds_database_name
  username = var.rds_username
  password = var.rds_password

  vpc_security_group_ids = var.rds_security_group_ids
  db_subnet_group_name   = var.rds_subnet_group_name

  backup_retention_period = var.rds_backup_retention_period
  backup_window          = var.rds_backup_window
  maintenance_window     = var.rds_maintenance_window

  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name_prefix}-primary-db-final-snapshot"

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-primary-db"
    }
  )
}

resource "aws_db_instance" "dr_read_replica" {
  count = var.enable_rds_replication ? 1 : 0
  provider = aws.dr

  identifier = "${local.dr_name_prefix}-read-replica"

  replicate_source_db = aws_db_instance.primary[0].identifier
  instance_class       = var.rds_instance_class

  vpc_security_group_ids = var.dr_rds_security_group_ids
  db_subnet_group_name   = var.dr_rds_subnet_group_name

  skip_final_snapshot       = true
  publicly_accessible        = false

  tags = merge(
    local.common_tags,
    {
      Name = "${local.dr_name_prefix}-read-replica"
      Environment = "${var.environment}-dr"
    }
  )

  depends_on = [aws_db_instance.primary]
}

# Route 53 Health Checks and Failover
resource "aws_route53_health_check" "primary" {
  fqdn                            = var.primary_health_check_fqdn
  port                            = var.primary_health_check_port
  type                            = var.primary_health_check_type
  resource_path                   = var.primary_health_check_path
  failure_threshold               = var.health_check_failure_threshold
  request_interval                = var.health_check_request_interval
  cloudwatch_logs_region          = var.aws_region
  cloudwatch_alarm_region         = var.aws_region
  cloudwatch_alarm_name           = "${local.name_prefix}-primary-health-alarm"
  insufficient_data_health_status = "Failure"
  invert_healthcheck              = false

  tags = local.common_tags
}

resource "aws_route53_health_check" "dr" {
  fqdn                            = var.dr_health_check_fqdn
  port                            = var.dr_health_check_port
  type                            = var.dr_health_check_type
  resource_path                   = var.dr_health_check_path
  failure_threshold               = var.health_check_failure_threshold
  request_interval                = var.health_check_request_interval
  cloudwatch_logs_region          = var.dr_region
  cloudwatch_alarm_region         = var.dr_region
  cloudwatch_alarm_name           = "${local.dr_name_prefix}-dr-health-alarm"
  insufficient_data_health_status = "Failure"
  invert_healthcheck              = false

  tags = merge(
    local.common_tags,
    {
      Environment = "${var.environment}-dr"
    }
  )
}

# Route 53 Records with Failover
resource "aws_route53_record" "primary" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  set_identifier = "primary"
  failover_routing_policy {
    type = "PRIMARY"
  }

  alias {
    name                   = var.primary_alb_dns_name
    zone_id               = var.primary_alb_zone_id
    evaluate_target_health = true
  }

  health_check_id = aws_route53_health_check.primary.id
}

resource "aws_route53_record" "dr" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  set_identifier = "dr"
  failover_routing_policy {
    type = "SECONDARY"
  }

  alias {
    name                   = var.dr_alb_dns_name
    zone_id               = var.dr_alb_zone_id
    evaluate_target_health = true
  }

  health_check_id = aws_route53_health_check.dr.id
}

# CloudWatch Alarms for Replication Status
resource "aws_cloudwatch_metric_alarm" "s3_replication_lag" {
  alarm_name          = "${local.name_prefix}-s3-replication-lag"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.replication_lag_evaluation_periods
  metric_name         = "ReplicationLatency"
  namespace           = "AWS/S3"
  period              = var.replication_lag_period
  statistic           = "Average"
  threshold           = var.replication_lag_threshold
  alarm_description   = "This metric monitors S3 replication lag"
  alarm_actions       = var.dr_sns_topic_arn != "" ? [var.dr_sns_topic_arn] : []
  treat_missing_data  = "notBreaching"

  dimensions = {
    BucketName = aws_s3_bucket.primary.id
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "rds_replication_lag" {
  count               = var.enable_rds_replication ? 1 : 0
  alarm_name          = "${local.name_prefix}-rds-replication-lag"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.replication_lag_evaluation_periods
  metric_name         = "ReadReplicaLag"
  namespace           = "AWS/RDS"
  period              = var.replication_lag_period
  statistic           = "Average"
  threshold           = var.rds_replication_lag_threshold
  alarm_description   = "This metric monitors RDS read replica lag"
  alarm_actions       = var.dr_sns_topic_arn != "" ? [var.dr_sns_topic_arn] : []
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.dr_read_replica[0].identifier
  }

  tags = merge(
    local.common_tags,
    {
      Environment = "${var.environment}-dr"
    }
  )
}

# Backup and Restore Automation
resource "aws_sns_topic" "dr_notifications" {
  name = "${local.name_prefix}-dr-notifications"

  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "dr_email" {
  count     = var.notification_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.dr_notifications.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

# Lambda Function for Automated Failover
resource "aws_iam_role" "failover_lambda" {
  name = "${local.name_prefix}-failover-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "failover_lambda_basic" {
  role       = aws_iam_role.failover_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "failover_lambda" {
  name = "${local.name_prefix}-failover-lambda-policy"
  role = aws_iam_role.failover_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "route53:ChangeResourceRecordSets",
          "route53:GetHealthCheckStatus",
          "route53:ListResourceRecordSets"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.dr_notifications.arn
      }
    ]
  })
}

# Archive the Lambda function code
data "archive_file" "failover_lambda" {
  type        = "zip"
  source_file = "${path.module}/failover_lambda.py"
  output_path = "${path.module}/failover_lambda.zip"
}

resource "aws_lambda_function" "failover" {
  function_name    = "${local.name_prefix}-failover-function"
  role            = aws_iam_role.failover_lambda.arn
  handler         = "failover_lambda.lambda_handler"
  runtime         = "python3.9"
  filename        = data.archive_file.failover_lambda.output_path
  source_code_hash = data.archive_file.failover_lambda.output_base64sha256

  timeout = 300

  environment {
    variables = {
      PRIMARY_HEALTH_CHECK_ID = aws_route53_health_check.primary.id
      DR_HEALTH_CHECK_ID     = aws_route53_health_check.dr.id
      ROUTE53_ZONE_ID        = var.route53_zone_id
      DOMAIN_NAME            = var.domain_name
      SNS_TOPIC_ARN          = aws_sns_topic.dr_notifications.arn
      ENABLE_AUTO_FAILOVER   = var.enable_auto_failover
    }
  }

  tags = local.common_tags
}

# CloudWatch Events for Failover Automation
resource "aws_cloudwatch_event_rule" "failover_trigger" {
  name                = "${local.name_prefix}-failover-trigger"
  description         = "Trigger automatic failover when primary health check fails"
  schedule_expression = "rate(1 minute)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "failover_lambda" {
  rule      = aws_cloudwatch_event_rule.failover_trigger.name
  target_id = "FailoverLambdaTarget"
  arn       = aws_lambda_function.failover.arn
}

resource "aws_lambda_permission" "allow_cloudwatch" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.failover.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.failover_trigger.arn
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "failover_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.failover.function_name}"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}