# Security Groups Module with Least Privilege Principle
# Creates comprehensive security groups for all infrastructure components

locals {
  name_prefix = var.name_prefix != "" ? var.name_prefix : "${var.project_name}-${var.environment}"
  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Owner       = "devops-team"
    Component   = "SecurityGroups"
  })
}

# Application Load Balancer Security Group
resource "aws_security_group" "alb" {
  name_prefix = "${local.name_prefix}-alb-"
  description = "Security group for Application Load Balancer"
  vpc_id      = var.vpc_id

  # HTTP inbound from anywhere (redirects to HTTPS)
  ingress {
    description = "HTTP inbound from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # HTTPS inbound from anywhere
  ingress {
    description = "HTTPS inbound from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # Outbound to application instances
  egress {
    description = "Outbound to application instances"
    from_port   = var.app_port
    to_port     = var.app_port
    protocol    = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # Outbound to health checks
  egress {
    description = "Outbound for health checks"
    from_port   = var.health_check_port
    to_port     = var.health_check_port
    protocol    = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # Ephemeral outbound
  egress {
    description = "Ephemeral outbound"
    from_port   = 1024
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-alb-sg"
      Type = "LoadBalancer"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Application Instances Security Group
resource "aws_security_group" "app" {
  name_prefix = "${local.name_prefix}-app-"
  description = "Security group for application instances"
  vpc_id      = var.vpc_id

  # Application port inbound from ALB
  ingress {
    description     = "Application port inbound from ALB"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Health check port inbound from ALB
  ingress {
    description     = "Health check port inbound from ALB"
    from_port       = var.health_check_port
    to_port         = var.health_check_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # SSH inbound from allowed IPs
  dynamic "ingress" {
    for_each = var.allowed_ssh_ips
    content {
      description = "SSH inbound from allowed IP"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  # Application monitoring inbound from CloudWatch (if enabled)
  dynamic "ingress" {
    for_each = var.enable_monitoring ? [1] : []
    content {
      description = "CloudWatch monitoring inbound"
      from_port   = 25826
      to_port     = 25826
      protocol    = "udp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  # Outbound to database
  dynamic "egress" {
    for_each = var.database_security_group_id != "" ? [1] : []
    content {
      description     = "Outbound to database"
      from_port       = var.database_port
      to_port         = var.database_port
      protocol        = "tcp"
      security_groups = [var.database_security_group_id]
    }
  }

  # Outbound to S3 (for backups)
  egress {
    description = "Outbound to S3"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound to external APIs (if needed)
  egress {
    description = "Outbound HTTPS to external APIs"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Ephemeral outbound
  egress {
    description = "Ephemeral outbound"
    from_port   = 1024
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-app-sg"
      Type = "Application"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Database Security Group
resource "aws_security_group" "database" {
  count       = var.create_database_sg ? 1 : 0
  name_prefix = "${local.name_prefix}-database-"
  description = "Security group for database instances"
  vpc_id      = var.vpc_id

  # Database port inbound from application instances
  ingress {
    description     = "Database port inbound from application instances"
    from_port       = var.database_port
    to_port         = var.database_port
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # Database port inbound from bastion (if provided)
  dynamic "ingress" {
    for_each = var.bastion_security_group_id != "" ? [1] : []
    content {
      description     = "Database port inbound from bastion"
      from_port       = var.database_port
      to_port         = var.database_port
      protocol        = "tcp"
      security_groups = [var.bastion_security_group_id]
    }
  }

  # Database port inbound from DR region (if provided)
  dynamic "ingress" {
    for_each = var.dr_database_sg_cidr != "" ? [1] : []
    content {
      description = "Database port inbound from DR region"
      from_port   = var.database_port
      to_port     = var.database_port
      protocol    = "tcp"
      cidr_blocks = [var.dr_database_sg_cidr]
    }
  }

  # Outbound (typically none for databases)
  egress {
    description = "Outbound (restricted)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-database-sg"
      Type = "Database"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Bastion Host Security Group
resource "aws_security_group" "bastion" {
  count       = var.create_bastion_sg ? 1 : 0
  name_prefix = "${local.name_prefix}-bastion-"
  description = "Security group for bastion host"
  vpc_id      = var.vpc_id

  # SSH inbound from allowed IPs
  dynamic "ingress" {
    for_each = var.allowed_ssh_ips
    content {
      description = "SSH inbound from allowed IP"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  # Outbound SSH to application instances
  egress {
    description     = "Outbound SSH to application instances"
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # Outbound to database (for administration)
  dynamic "egress" {
    for_each = var.create_database_sg ? [1] : []
    content {
      description     = "Outbound to database"
      from_port       = var.database_port
      to_port         = var.database_port
      protocol        = "tcp"
      security_groups = aws_security_group.database[*].id
    }
  }

  # Outbound to external services (updates, etc.)
  egress {
    description = "Outbound HTTPS for updates"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Ephemeral outbound
  egress {
    description = "Ephemeral outbound"
    from_port   = 1024
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-bastion-sg"
      Type = "Bastion"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# ECS/EKS Security Group (for container services)
resource "aws_security_group" "ecs" {
  count       = var.create_ecs_sg ? 1 : 0
  name_prefix = "${local.name_prefix}-ecs-"
  description = "Security group for ECS/EKS nodes"
  vpc_id      = var.vpc_id

  # Application port inbound from ALB
  ingress {
    description     = "Application port inbound from ALB"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Health check port inbound from ALB
  ingress {
    description     = "Health check port inbound from ALB"
    from_port       = var.health_check_port
    to_port         = var.health_check_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Container communication
  ingress {
    description = "Container communication"
    from_port   = 0
    to_port     = 65535
    protocol    = "-1"
    self        = true
  }

  # Outbound to database
  dynamic "egress" {
    for_each = var.create_database_sg ? [1] : []
    content {
      description     = "Outbound to database"
      from_port       = var.database_port
      to_port         = var.database_port
      protocol        = "tcp"
      security_groups = aws_security_group.database[*].id
    }
  }

  # Outbound to S3 and external APIs
  egress {
    description = "Outbound HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Ephemeral outbound
  egress {
    description = "Ephemeral outbound"
    from_port   = 1024
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-ecs-sg"
      Type = "Container"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Monitoring Security Group
resource "aws_security_group" "monitoring" {
  count       = var.create_monitoring_sg ? 1 : 0
  name_prefix = "${local.name_prefix}-monitoring-"
  description = "Security group for monitoring services"
  vpc_id      = var.vpc_id

  # Prometheus inbound
  ingress {
    description = "Prometheus inbound"
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = var.monitoring_allowed_cidrs
  }

  # Grafana inbound
  ingress {
    description = "Grafana inbound"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = var.monitoring_allowed_cidrs
  }

  # Node Exporter inbound from monitoring
  ingress {
    description     = "Node Exporter inbound"
    from_port       = 9100
    to_port         = 9100
    protocol        = "tcp"
    security_groups = aws_security_group.monitoring[*].id
  }

  # Outbound to collect metrics from instances
  egress {
    description     = "Outbound to collect metrics"
    from_port       = 9100
    to_port         = 9100
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # Outbound to external services
  egress {
    description = "Outbound HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-monitoring-sg"
      Type = "Monitoring"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Security Group Rules for additional ports
resource "aws_security_group_rule" "app_additional_ingress" {
  for_each = var.additional_app_ports

  type              = "ingress"
  from_port         = each.value.port
  to_port           = each.value.port
  protocol          = each.value.protocol
  description       = each.value.description
  security_group_id = aws_security_group.app.id

  dynamic "cidr_blocks" {
    for_each = each.value.cidr_blocks != null ? [each.value.cidr_blocks] : []
    content {
      cidr_blocks = cidr_blocks.value
    }
  }

  dynamic "security_groups" {
    for_each = each.value.security_groups != null ? [each.value.security_groups] : []
    content {
      security_groups = security_groups.value
    }
  }
}

# Security Group Rules for database access from additional sources
resource "aws_security_group_rule" "database_additional_ingress" {
  for_each = var.create_database_sg ? var.additional_database_ports : {}

  type              = "ingress"
  from_port         = each.value.port
  to_port           = each.value.port
  protocol          = each.value.protocol
  description       = each.value.description
  security_group_id = aws_security_group.database[0].id

  dynamic "cidr_blocks" {
    for_each = each.value.cidr_blocks != null ? [each.value.cidr_blocks] : []
    content {
      cidr_blocks = cidr_blocks.value
    }
  }

  dynamic "security_groups" {
    for_each = each.value.security_groups != null ? [each.value.security_groups] : []
    content {
      security_groups = security_groups.value
    }
  }
}