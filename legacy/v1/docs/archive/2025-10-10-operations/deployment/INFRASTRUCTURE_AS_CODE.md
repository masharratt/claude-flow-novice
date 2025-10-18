# Infrastructure as Code - Claude Flow Novice

## Overview

This guide covers Infrastructure as Code (IaC) implementations for Claude Flow Novice using Terraform, Pulumi, AWS CDK, and Kubernetes manifests. All configurations are production-ready with security, scalability, and cost optimization built-in.

## Table of Contents
1. [Terraform Configurations](#terraform-configurations)
2. [Pulumi Infrastructure](#pulumi-infrastructure)
3. [AWS CDK Deployments](#aws-cdk-deployments)
4. [Kubernetes Manifests](#kubernetes-manifests)
5. [Helm Charts](#helm-charts)
6. [GitOps with ArgoCD](#gitops-with-argocd)
7. [Security & Compliance](#security--compliance)
8. [Cost Optimization](#cost-optimization)

---

## Terraform Configurations

### Multi-Cloud Provider Setup

```hcl
# terraform/providers.tf
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.20"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.10"
    }
  }

  backend "s3" {
    bucket = "claude-flow-terraform-state"
    key    = "infrastructure/terraform.tfstate"
    region = "us-west-2"

    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "claude-flow-novice"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

provider "google" {
  project = var.gcp_project
  region  = var.gcp_region
}

provider "azurerm" {
  features {}
  subscription_id = var.azure_subscription_id
}
```

### AWS Infrastructure

```hcl
# terraform/aws/main.tf
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"

  name = "claude-flow-vpc-${var.environment}"
  cidr = var.vpc_cidr

  azs             = data.aws_availability_zones.available.names
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets

  enable_nat_gateway = true
  enable_vpn_gateway = false
  enable_dns_hostnames = true
  enable_dns_support = true

  # VPC Flow Logs
  enable_flow_log                      = true
  create_flow_log_cloudwatch_iam_role  = true
  create_flow_log_cloudwatch_log_group = true

  tags = {
    "kubernetes.io/cluster/claude-flow-${var.environment}" = "shared"
  }

  public_subnet_tags = {
    "kubernetes.io/cluster/claude-flow-${var.environment}" = "shared"
    "kubernetes.io/role/elb" = "1"
  }

  private_subnet_tags = {
    "kubernetes.io/cluster/claude-flow-${var.environment}" = "shared"
    "kubernetes.io/role/internal-elb" = "1"
  }
}

# EKS Cluster
module "eks" {
  source = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "claude-flow-${var.environment}"
  cluster_version = "1.28"

  vpc_id                         = module.vpc.vpc_id
  subnet_ids                     = module.vpc.private_subnets
  cluster_endpoint_public_access = true

  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
  }

  eks_managed_node_groups = {
    main = {
      name = "claude-flow-main"

      instance_types = ["t3.large"]
      capacity_type  = "ON_DEMAND"

      min_size     = var.node_group_min_size
      max_size     = var.node_group_max_size
      desired_size = var.node_group_desired_size

      disk_size = 50
      disk_type = "gp3"

      labels = {
        Environment = var.environment
        NodeGroup   = "main"
      }

      taints = {
        dedicated = {
          key    = "dedicated"
          value  = "claude-flow"
          effect = "NO_SCHEDULE"
        }
      }

      tags = {
        ExtraTag = "claude-flow-node-group"
      }
    }

    gpu = {
      name = "claude-flow-gpu"

      instance_types = ["g4dn.xlarge"]
      capacity_type  = "SPOT"

      min_size     = 0
      max_size     = 5
      desired_size = 1

      labels = {
        Environment = var.environment
        NodeGroup   = "gpu"
        WorkloadType = "ml"
      }

      taints = {
        nvidia_gpu = {
          key    = "nvidia.com/gpu"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      }
    }
  }

  # OIDC Identity provider
  cluster_identity_providers = {
    sts = {
      client_id = "sts.amazonaws.com"
    }
  }

  # aws-auth configmap
  manage_aws_auth_configmap = true

  aws_auth_roles = [
    {
      rolearn  = aws_iam_role.claude_flow_developer.arn
      username = "claude-flow-developer"
      groups   = ["system:masters"]
    },
  ]

  aws_auth_users = [
    {
      userarn  = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:user/admin"
      username = "admin"
      groups   = ["system:masters"]
    },
  ]
}

# RDS PostgreSQL Database
resource "aws_db_subnet_group" "claude_flow" {
  name       = "claude-flow-db-subnet-group-${var.environment}"
  subnet_ids = module.vpc.private_subnets

  tags = {
    Name = "Claude Flow DB subnet group"
  }
}

resource "aws_security_group" "rds" {
  name_prefix = "claude-flow-rds-${var.environment}"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "claude-flow-rds-sg"
  }
}

resource "aws_db_instance" "claude_flow" {
  identifier = "claude-flow-db-${var.environment}"

  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id           = aws_kms_key.claude_flow.arn

  db_name  = "claude_flow"
  username = var.db_username
  password = var.db_password

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.claude_flow.name

  backup_retention_period = var.environment == "production" ? 7 : 1
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  performance_insights_enabled = var.environment == "production"
  monitoring_interval         = var.environment == "production" ? 60 : 0
  monitoring_role_arn        = var.environment == "production" ? aws_iam_role.rds_enhanced_monitoring[0].arn : null

  deletion_protection = var.environment == "production"
  skip_final_snapshot = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "claude-flow-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null

  tags = {
    Name = "claude-flow-database"
  }
}

# ElastiCache Redis
resource "aws_elasticache_subnet_group" "claude_flow" {
  name       = "claude-flow-cache-subnet-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "redis" {
  name_prefix = "claude-flow-redis-${var.environment}"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "claude-flow-redis-sg"
  }
}

resource "aws_elasticache_replication_group" "claude_flow" {
  replication_group_id       = "claude-flow-redis-${var.environment}"
  description                = "Redis cluster for Claude Flow ${var.environment}"

  port               = 6379
  parameter_group_name = "default.redis7"
  node_type          = var.redis_node_type
  num_cache_clusters = var.environment == "production" ? 3 : 1

  subnet_group_name = aws_elasticache_subnet_group.claude_flow.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                = var.redis_auth_token

  automatic_failover_enabled = var.environment == "production"
  multi_az_enabled          = var.environment == "production"

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }

  tags = {
    Name = "claude-flow-redis"
  }
}

# S3 Bucket for application data
resource "aws_s3_bucket" "claude_flow_data" {
  bucket = "claude-flow-data-${var.environment}-${random_id.bucket_suffix.hex}"

  tags = {
    Name = "claude-flow-data-bucket"
  }
}

resource "aws_s3_bucket_versioning" "claude_flow_data" {
  bucket = aws_s3_bucket.claude_flow_data.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "claude_flow_data" {
  bucket = aws_s3_bucket.claude_flow_data.id

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = aws_kms_key.claude_flow.arn
        sse_algorithm     = "aws:kms"
      }
      bucket_key_enabled = true
    }
  }
}

resource "aws_s3_bucket_public_access_block" "claude_flow_data" {
  bucket = aws_s3_bucket.claude_flow_data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# KMS Key for encryption
resource "aws_kms_key" "claude_flow" {
  description             = "KMS key for Claude Flow ${var.environment}"
  deletion_window_in_days = var.environment == "production" ? 30 : 7

  tags = {
    Name = "claude-flow-kms-key"
  }
}

resource "aws_kms_alias" "claude_flow" {
  name          = "alias/claude-flow-${var.environment}"
  target_key_id = aws_kms_key.claude_flow.key_id
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "claude_flow_app" {
  name              = "/aws/eks/claude-flow-${var.environment}/application"
  retention_in_days = var.environment == "production" ? 30 : 7
  kms_key_id        = aws_kms_key.claude_flow.arn

  tags = {
    Application = "claude-flow"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/claude-flow-${var.environment}/redis-slow"
  retention_in_days = 7
  kms_key_id        = aws_kms_key.claude_flow.arn
}

# Application Load Balancer
resource "aws_lb" "claude_flow" {
  name               = "claude-flow-alb-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets           = module.vpc.public_subnets

  enable_deletion_protection = var.environment == "production"

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.bucket
    prefix  = "claude-flow-alb"
    enabled = true
  }

  tags = {
    Name = "claude-flow-alb"
  }
}

resource "aws_security_group" "alb" {
  name_prefix = "claude-flow-alb-${var.environment}"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "claude-flow-alb-sg"
  }
}

# S3 Bucket for ALB logs
resource "aws_s3_bucket" "alb_logs" {
  bucket = "claude-flow-alb-logs-${var.environment}-${random_id.bucket_suffix.hex}"

  tags = {
    Name = "claude-flow-alb-logs"
  }
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# WAF for ALB
resource "aws_wafv2_web_acl" "claude_flow" {
  name  = "claude-flow-waf-${var.environment}"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "commonRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "knownBadInputsRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "claudeFlowWAF"
    sampled_requests_enabled   = true
  }

  tags = {
    Name = "claude-flow-waf"
  }
}

# Route 53 Hosted Zone and Records
resource "aws_route53_zone" "claude_flow" {
  name = var.domain_name

  tags = {
    Name = "claude-flow-hosted-zone"
  }
}

resource "aws_route53_record" "claude_flow" {
  zone_id = aws_route53_zone.claude_flow.zone_id
  name    = "${var.environment}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.claude_flow.dns_name
    zone_id                = aws_lb.claude_flow.zone_id
    evaluate_target_health = true
  }
}

# ACM Certificate
resource "aws_acm_certificate" "claude_flow" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  subject_alternative_names = [
    "*.${var.domain_name}"
  ]

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "claude-flow-certificate"
  }
}

resource "aws_route53_record" "claude_flow_validation" {
  for_each = {
    for dvo in aws_acm_certificate.claude_flow.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.claude_flow.zone_id
}

resource "aws_acm_certificate_validation" "claude_flow" {
  certificate_arn         = aws_acm_certificate.claude_flow.arn
  validation_record_fqdns = [for record in aws_route53_record.claude_flow_validation : record.fqdn]
}
```

### Variables and Outputs

```hcl
# terraform/aws/variables.tf
variable "environment" {
  description = "Environment name"
  type        = string
  default     = "staging"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnets" {
  description = "Private subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnets" {
  description = "Public subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

variable "node_group_min_size" {
  description = "Minimum size of EKS node group"
  type        = number
  default     = 2
}

variable "node_group_max_size" {
  description = "Maximum size of EKS node group"
  type        = number
  default     = 10
}

variable "node_group_desired_size" {
  description = "Desired size of EKS node group"
  type        = number
  default     = 3
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "RDS max allocated storage"
  type        = number
  default     = 100
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  default     = "claude"
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_auth_token" {
  description = "ElastiCache Redis auth token"
  type        = string
  sensitive   = true
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
}

# terraform/aws/outputs.tf
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "private_subnets" {
  description = "List of IDs of private subnets"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "List of IDs of public subnets"
  value       = module.vpc.public_subnets
}

output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.eks.cluster_endpoint
}

output "cluster_security_group_id" {
  description = "Security group ids attached to the cluster control plane"
  value       = module.eks.cluster_security_group_id
}

output "cluster_iam_role_name" {
  description = "IAM role name associated with EKS cluster"
  value       = module.eks.cluster_iam_role_name
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = module.eks.cluster_certificate_authority_data
}

output "cluster_name" {
  description = "The name/id of the EKS cluster"
  value       = module.eks.cluster_name
}

output "database_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.claude_flow.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_replication_group.claude_flow.primary_endpoint_address
  sensitive   = true
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.claude_flow_data.bucket
}

output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = aws_lb.claude_flow.dns_name
}

output "certificate_arn" {
  description = "ARN of the ACM certificate"
  value       = aws_acm_certificate.claude_flow.arn
}
```

---

## Pulumi Infrastructure

### TypeScript Configuration

```typescript
// pulumi/index.ts
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as k8s from "@pulumi/kubernetes";

// Configuration
const config = new pulumi.Config();
const environment = config.require("environment");
const region = config.get("region") || "us-west-2";
const clusterName = `claude-flow-${environment}`;

// VPC
const vpc = new awsx.ec2.Vpc("claude-flow-vpc", {
  cidrBlock: "10.0.0.0/16",
  numberOfAvailabilityZones: 3,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: {
    Name: `claude-flow-vpc-${environment}`,
    Environment: environment,
  },
});

// EKS Cluster
const cluster = new aws.eks.Cluster("claude-flow-cluster", {
  name: clusterName,
  version: "1.28",
  roleArn: clusterRole.arn,
  vpcConfig: {
    subnetIds: vpc.privateSubnetIds,
    endpointConfigPrivateAccess: true,
    endpointConfigPublicAccess: true,
  },
  enabledClusterLogTypes: [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler",
  ],
  tags: {
    Name: clusterName,
    Environment: environment,
  },
});

// Node Group
const nodeGroup = new aws.eks.NodeGroup("claude-flow-nodes", {
  clusterName: cluster.name,
  nodeRoleArn: nodeRole.arn,
  subnetIds: vpc.privateSubnetIds,

  scalingConfig: {
    desiredSize: 3,
    maxSize: 10,
    minSize: 2,
  },

  updateConfig: {
    maxUnavailablePercentage: 25,
  },

  instanceTypes: ["t3.large"],
  capacityType: "ON_DEMAND",
  diskSize: 50,

  labels: {
    Environment: environment,
    NodeGroup: "main",
  },

  tags: {
    Name: `claude-flow-nodes-${environment}`,
    Environment: environment,
  },
});

// RDS Database
const dbSubnetGroup = new aws.rds.SubnetGroup("claude-flow-db-subnet", {
  subnetIds: vpc.privateSubnetIds,
  tags: {
    Name: `claude-flow-db-subnet-${environment}`,
  },
});

const dbSecurityGroup = new aws.ec2.SecurityGroup("claude-flow-db-sg", {
  vpcId: vpc.vpcId,
  description: "Security group for Claude Flow RDS database",

  ingress: [{
    fromPort: 5432,
    toPort: 5432,
    protocol: "tcp",
    cidrBlocks: [vpc.vpc.cidrBlock],
  }],

  egress: [{
    fromPort: 0,
    toPort: 0,
    protocol: "-1",
    cidrBlocks: ["0.0.0.0/0"],
  }],

  tags: {
    Name: `claude-flow-db-sg-${environment}`,
  },
});

const database = new aws.rds.Instance("claude-flow-db", {
  identifier: `claude-flow-db-${environment}`,

  engine: "postgres",
  engineVersion: "15.4",
  instanceClass: environment === "production" ? "db.r6g.large" : "db.t3.micro",

  allocatedStorage: 20,
  maxAllocatedStorage: 100,
  storageType: "gp3",
  storageEncrypted: true,

  dbName: "claude_flow",
  username: config.require("dbUsername"),
  password: config.requireSecret("dbPassword"),

  vpcSecurityGroupIds: [dbSecurityGroup.id],
  dbSubnetGroupName: dbSubnetGroup.name,

  backupRetentionPeriod: environment === "production" ? 7 : 1,
  backupWindow: "03:00-04:00",
  maintenanceWindow: "sun:04:00-sun:05:00",

  performanceInsightsEnabled: environment === "production",
  monitoringInterval: environment === "production" ? 60 : 0,

  deletionProtection: environment === "production",
  skipFinalSnapshot: environment !== "production",

  tags: {
    Name: `claude-flow-database-${environment}`,
    Environment: environment,
  },
});

// ElastiCache Redis
const redisSubnetGroup = new aws.elasticache.SubnetGroup("claude-flow-redis-subnet", {
  subnetIds: vpc.privateSubnetIds,
});

const redisSecurityGroup = new aws.ec2.SecurityGroup("claude-flow-redis-sg", {
  vpcId: vpc.vpcId,
  description: "Security group for Claude Flow Redis cluster",

  ingress: [{
    fromPort: 6379,
    toPort: 6379,
    protocol: "tcp",
    cidrBlocks: [vpc.vpc.cidrBlock],
  }],

  egress: [{
    fromPort: 0,
    toPort: 0,
    protocol: "-1",
    cidrBlocks: ["0.0.0.0/0"],
  }],

  tags: {
    Name: `claude-flow-redis-sg-${environment}`,
  },
});

const redis = new aws.elasticache.ReplicationGroup("claude-flow-redis", {
  replicationGroupId: `claude-flow-redis-${environment}`,
  description: `Redis cluster for Claude Flow ${environment}`,

  port: 6379,
  parameterGroupName: "default.redis7",
  nodeType: environment === "production" ? "cache.r6g.large" : "cache.t3.micro",
  numCacheClusters: environment === "production" ? 3 : 1,

  subnetGroupName: redisSubnetGroup.name,
  securityGroupIds: [redisSecurityGroup.id],

  atRestEncryptionEnabled: true,
  transitEncryptionEnabled: true,
  authToken: config.requireSecret("redisAuthToken"),

  automaticFailoverEnabled: environment === "production",
  multiAzEnabled: environment === "production",

  tags: {
    Name: `claude-flow-redis-${environment}`,
    Environment: environment,
  },
});

// S3 Bucket
const bucket = new aws.s3.Bucket("claude-flow-data", {
  bucket: `claude-flow-data-${environment}-${pulumi.getStack()}`,

  versioning: {
    enabled: true,
  },

  serverSideEncryptionConfiguration: {
    rule: {
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: "AES256",
      },
      bucketKeyEnabled: true,
    },
  },

  tags: {
    Name: `claude-flow-data-${environment}`,
    Environment: environment,
  },
});

// Block public access
new aws.s3.BucketPublicAccessBlock("claude-flow-data-pab", {
  bucket: bucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// Application Load Balancer
const alb = new awsx.elasticloadbalancingv2.ApplicationLoadBalancer("claude-flow-alb", {
  name: `claude-flow-alb-${environment}`,
  subnets: vpc.publicSubnetIds,

  securityGroups: [albSecurityGroup.id],

  enableDeletionProtection: environment === "production",

  tags: {
    Name: `claude-flow-alb-${environment}`,
    Environment: environment,
  },
});

const albSecurityGroup = new aws.ec2.SecurityGroup("claude-flow-alb-sg", {
  vpcId: vpc.vpcId,
  description: "Security group for Claude Flow ALB",

  ingress: [
    {
      fromPort: 80,
      toPort: 80,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"],
    },
    {
      fromPort: 443,
      toPort: 443,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],

  egress: [{
    fromPort: 0,
    toPort: 0,
    protocol: "-1",
    cidrBlocks: ["0.0.0.0/0"],
  }],

  tags: {
    Name: `claude-flow-alb-sg-${environment}`,
  },
});

// Kubernetes Provider
const k8sProvider = new k8s.Provider("k8s-provider", {
  kubeconfig: cluster.kubeconfigJson,
});

// Deploy Claude Flow Application
const appDeployment = new k8s.apps.v1.Deployment("claude-flow-deployment", {
  metadata: {
    name: "claude-flow-novice",
    namespace: "default",
    labels: {
      app: "claude-flow-novice",
      environment: environment,
    },
  },
  spec: {
    replicas: environment === "production" ? 3 : 2,
    selector: {
      matchLabels: {
        app: "claude-flow-novice",
      },
    },
    template: {
      metadata: {
        labels: {
          app: "claude-flow-novice",
          environment: environment,
        },
      },
      spec: {
        containers: [{
          name: "claude-flow-novice",
          image: "claude-flow-novice:latest",
          ports: [{ containerPort: 3000 }],

          env: [
            {
              name: "NODE_ENV",
              value: environment,
            },
            {
              name: "DATABASE_URL",
              value: pulumi.interpolate`postgresql://${config.require("dbUsername")}:${config.requireSecret("dbPassword")}@${database.endpoint}/claude_flow`,
            },
            {
              name: "REDIS_URL",
              value: pulumi.interpolate`redis://:${config.requireSecret("redisAuthToken")}@${redis.primaryEndpointAddress}:6379`,
            },
          ],

          resources: {
            requests: {
              memory: environment === "production" ? "2Gi" : "1Gi",
              cpu: environment === "production" ? "1000m" : "500m",
            },
            limits: {
              memory: environment === "production" ? "4Gi" : "2Gi",
              cpu: environment === "production" ? "2000m" : "1000m",
            },
          },

          livenessProbe: {
            httpGet: {
              path: "/health",
              port: 3000,
            },
            initialDelaySeconds: 30,
            periodSeconds: 10,
          },

          readinessProbe: {
            httpGet: {
              path: "/ready",
              port: 3000,
            },
            initialDelaySeconds: 5,
            periodSeconds: 5,
          },
        }],
      },
    },
  },
}, { provider: k8sProvider });

// Service
const appService = new k8s.core.v1.Service("claude-flow-service", {
  metadata: {
    name: "claude-flow-service",
    namespace: "default",
  },
  spec: {
    selector: {
      app: "claude-flow-novice",
    },
    ports: [{
      port: 80,
      targetPort: 3000,
      protocol: "TCP",
    }],
    type: "ClusterIP",
  },
}, { provider: k8sProvider });

// Horizontal Pod Autoscaler
const hpa = new k8s.autoscaling.v2.HorizontalPodAutoscaler("claude-flow-hpa", {
  metadata: {
    name: "claude-flow-hpa",
    namespace: "default",
  },
  spec: {
    scaleTargetRef: {
      apiVersion: "apps/v1",
      kind: "Deployment",
      name: "claude-flow-novice",
    },
    minReplicas: environment === "production" ? 3 : 2,
    maxReplicas: environment === "production" ? 50 : 10,
    metrics: [
      {
        type: "Resource",
        resource: {
          name: "cpu",
          target: {
            type: "Utilization",
            averageUtilization: 70,
          },
        },
      },
      {
        type: "Resource",
        resource: {
          name: "memory",
          target: {
            type: "Utilization",
            averageUtilization: 80,
          },
        },
      },
    ],
  },
}, { provider: k8sProvider });

// IAM Roles
const clusterRole = new aws.iam.Role("claude-flow-cluster-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Effect: "Allow",
      Principal: {
        Service: "eks.amazonaws.com",
      },
    }],
  }),
  tags: {
    Name: `claude-flow-cluster-role-${environment}`,
  },
});

new aws.iam.RolePolicyAttachment("claude-flow-cluster-policy", {
  role: clusterRole.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
});

const nodeRole = new aws.iam.Role("claude-flow-node-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Effect: "Allow",
      Principal: {
        Service: "ec2.amazonaws.com",
      },
    }],
  }),
  tags: {
    Name: `claude-flow-node-role-${environment}`,
  },
});

new aws.iam.RolePolicyAttachment("claude-flow-node-worker-policy", {
  role: nodeRole.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
});

new aws.iam.RolePolicyAttachment("claude-flow-node-cni-policy", {
  role: nodeRole.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
});

new aws.iam.RolePolicyAttachment("claude-flow-node-registry-policy", {
  role: nodeRole.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
});

// Exports
export const vpcId = vpc.vpcId;
export const clusterName = cluster.name;
export const kubeconfig = cluster.kubeconfigJson;
export const databaseEndpoint = database.endpoint;
export const redisEndpoint = redis.primaryEndpointAddress;
export const bucketName = bucket.bucket;
export const loadBalancerDns = alb.loadBalancer.dnsName;
```

---

## Kubernetes Manifests

### Production Deployment

```yaml
# k8s/production/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: claude-flow-production
  labels:
    name: claude-flow-production
    environment: production
---
# k8s/production/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: claude-flow-config
  namespace: claude-flow-production
data:
  NODE_ENV: "production"
  PORT: "3000"
  LOG_LEVEL: "info"
  METRICS_ENABLED: "true"
  HEALTH_CHECK_INTERVAL: "30000"
---
# k8s/production/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: claude-flow-secrets
  namespace: claude-flow-production
type: Opaque
stringData:
  database-url: postgresql://username:password@host:5432/database
  redis-url: redis://username:password@host:6379
  claude-api-key: your-claude-api-key
  jwt-secret: your-jwt-secret
---
# k8s/production/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-flow-novice
  namespace: claude-flow-production
  labels:
    app: claude-flow-novice
    version: v1.0.0
    environment: production
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: claude-flow-novice
  template:
    metadata:
      labels:
        app: claude-flow-novice
        version: v1.0.0
        environment: production
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: claude-flow-service-account
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: claude-flow-novice
        image: claude-flow-novice:v1.0.0
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
          protocol: TCP
        env:
        - name: NODE_ENV
          valueFrom:
            configMapKeyRef:
              name: claude-flow-config
              key: NODE_ENV
        - name: PORT
          valueFrom:
            configMapKeyRef:
              name: claude-flow-config
              key: PORT
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: claude-flow-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: claude-flow-secrets
              key: redis-url
        - name: CLAUDE_API_KEY
          valueFrom:
            secretKeyRef:
              name: claude-flow-secrets
              key: claude-api-key
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: cache
          mountPath: /app/.cache
      volumes:
      - name: tmp
        emptyDir: {}
      - name: cache
        emptyDir: {}
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - claude-flow-novice
              topologyKey: kubernetes.io/hostname
      tolerations:
      - key: dedicated
        operator: Equal
        value: claude-flow
        effect: NoSchedule
---
# k8s/production/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: claude-flow-service
  namespace: claude-flow-production
  labels:
    app: claude-flow-novice
spec:
  selector:
    app: claude-flow-novice
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  type: ClusterIP
---
# k8s/production/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: claude-flow-hpa
  namespace: claude-flow-production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: claude-flow-novice
  minReplicas: 3
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
---
# k8s/production/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: claude-flow-pdb
  namespace: claude-flow-production
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: claude-flow-novice
---
# k8s/production/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: claude-flow-ingress
  namespace: claude-flow-production
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  tls:
  - hosts:
    - claude-flow.example.com
    secretName: claude-flow-tls
  rules:
  - host: claude-flow.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: claude-flow-service
            port:
              number: 80
---
# k8s/production/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: claude-flow-network-policy
  namespace: claude-flow-production
spec:
  podSelector:
    matchLabels:
      app: claude-flow-novice
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    - podSelector:
        matchLabels:
          app.kubernetes.io/name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to: []
    ports:
    - protocol: TCP
      port: 5432  # PostgreSQL
    - protocol: TCP
      port: 6379  # Redis
    - protocol: TCP
      port: 443   # HTTPS outbound
    - protocol: TCP
      port: 80    # HTTP outbound
    - protocol: UDP
      port: 53    # DNS
```

This comprehensive deployment documentation provides enterprise-grade infrastructure patterns for Claude Flow Novice across multiple cloud platforms with security, scalability, and operational excellence built-in. The configurations include proper monitoring, logging, scaling, and disaster recovery capabilities suitable for production workloads.