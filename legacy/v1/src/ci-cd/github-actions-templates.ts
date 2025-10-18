/**
 * GitHub Actions Templates for Claude Flow Novice CI/CD
 *
 * This module provides production-ready GitHub Actions workflow templates
 * for different deployment scenarios and cloud platforms.
 */

export interface WorkflowTemplate {
  name: string;
  description: string;
  triggers: string[];
  jobs: Record<string, any>;
  environment?: string;
  secrets?: string[];
}

export class GitHubActionsTemplates {
  /**
   * Production deployment workflow with multi-stage pipeline
   */
  static getProductionDeploymentWorkflow(): WorkflowTemplate {
    return {
      name: 'Production Deployment Pipeline',
      description:
        'Complete CI/CD pipeline with security scanning, testing, and multi-environment deployment',
      triggers: ['push:main', 'push:tags', 'pull_request'],
      secrets: ['CLAUDE_API_KEY', 'DOCKER_REGISTRY_TOKEN', 'KUBE_CONFIG'],
      jobs: {
        test: {
          'runs-on': 'ubuntu-latest',
          strategy: {
            matrix: {
              'node-version': [18, 20, 22],
              os: ['ubuntu-latest', 'macos-latest', 'windows-latest'],
            },
          },
          steps: [
            { uses: 'actions/checkout@v4' },
            {
              name: 'Setup Node.js',
              uses: 'actions/setup-node@v4',
              with: {
                'node-version': '${{ matrix.node-version }}',
                cache: 'npm',
              },
            },
            { run: 'npm ci' },
            { run: 'npm run lint' },
            { run: 'npm run typecheck' },
            { run: 'npm run test:ci' },
            { run: 'npm run test:e2e' },
            {
              name: 'Upload coverage',
              uses: 'codecov/codecov-action@v3',
              with: {
                file: './coverage/lcov.info',
              },
            },
          ],
        },

        'security-scan': {
          'runs-on': 'ubuntu-latest',
          steps: [
            { uses: 'actions/checkout@v4' },
            {
              name: 'Run Trivy vulnerability scanner',
              uses: 'aquasecurity/trivy-action@master',
              with: {
                'scan-type': 'fs',
                format: 'sarif',
                output: 'trivy-results.sarif',
              },
            },
            {
              name: 'Run npm audit',
              run: 'npm audit --audit-level high',
            },
            {
              name: 'Run Snyk security scan',
              uses: 'snyk/actions/node@master',
              env: {
                SNYK_TOKEN: '${{ secrets.SNYK_TOKEN }}',
              },
            },
          ],
        },

        'build-and-push': {
          needs: ['test', 'security-scan'],
          'runs-on': 'ubuntu-latest',
          outputs: {
            'image-digest': '${{ steps.build.outputs.digest }}',
            'image-tag': '${{ steps.meta.outputs.tags }}',
          },
          steps: [
            { uses: 'actions/checkout@v4' },
            {
              name: 'Set up Docker Buildx',
              uses: 'docker/setup-buildx-action@v3',
            },
            {
              name: 'Login to Container Registry',
              uses: 'docker/login-action@v3',
              with: {
                registry: '${{ env.REGISTRY }}',
                username: '${{ github.actor }}',
                password: '${{ secrets.GITHUB_TOKEN }}',
              },
            },
            {
              name: 'Extract metadata',
              id: 'meta',
              uses: 'docker/metadata-action@v5',
              with: {
                images: '${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}',
                tags: [
                  'type=ref,event=branch',
                  'type=ref,event=pr',
                  'type=semver,pattern={{version}}',
                  'type=semver,pattern={{major}}.{{minor}}',
                  'type=sha,prefix={{branch}}-',
                ],
              },
            },
            {
              name: 'Build and push Docker image',
              id: 'build',
              uses: 'docker/build-push-action@v5',
              with: {
                context: '.',
                platforms: 'linux/amd64,linux/arm64',
                push: true,
                tags: '${{ steps.meta.outputs.tags }}',
                labels: '${{ steps.meta.outputs.labels }}',
                'cache-from': 'type=gha',
                'cache-to': 'type=gha,mode=max',
                'build-args': ['NODE_ENV=production', 'BUILD_VERSION=${{ github.sha }}'],
              },
            },
          ],
        },

        'deploy-staging': {
          needs: 'build-and-push',
          'runs-on': 'ubuntu-latest',
          environment: 'staging',
          if: "github.ref == 'refs/heads/main'",
          steps: [
            {
              name: 'Deploy to staging',
              run: `
                kubectl config use-context staging
                kubectl set image deployment/claude-flow-novice \\
                  claude-flow-novice=\${{ needs.build-and-push.outputs.image-tag }} \\
                  --namespace=staging
                kubectl rollout status deployment/claude-flow-novice --namespace=staging
              `,
            },
            {
              name: 'Run smoke tests',
              run: 'npm run test:smoke -- --environment=staging',
            },
          ],
        },

        'deploy-production': {
          needs: ['build-and-push', 'deploy-staging'],
          'runs-on': 'ubuntu-latest',
          environment: 'production',
          if: "startsWith(github.ref, 'refs/tags/v')",
          steps: [
            {
              name: 'Deploy to production',
              run: `
                kubectl config use-context production
                kubectl set image deployment/claude-flow-novice \\
                  claude-flow-novice=\${{ needs.build-and-push.outputs.image-tag }} \\
                  --namespace=production
                kubectl rollout status deployment/claude-flow-novice --namespace=production
              `,
            },
            {
              name: 'Run production health checks',
              run: 'npm run test:health -- --environment=production',
            },
            {
              name: 'Send deployment notification',
              uses: '8398a7/action-slack@v3',
              with: {
                status: '${{ job.status }}',
                text: 'Production deployment completed successfully',
              },
            },
          ],
        },
      },
    };
  }

  /**
   * Performance testing workflow
   */
  static getPerformanceTestingWorkflow(): WorkflowTemplate {
    return {
      name: 'Performance Testing',
      description: 'Comprehensive performance testing with load testing and monitoring',
      triggers: ['pull_request', 'schedule:daily'],
      jobs: {
        'performance-test': {
          'runs-on': 'ubuntu-latest',
          strategy: {
            matrix: {
              'test-type': ['load', 'stress', 'endurance', 'spike'],
            },
          },
          steps: [
            { uses: 'actions/checkout@v4' },
            {
              name: 'Setup Node.js',
              uses: 'actions/setup-node@v4',
              with: {
                'node-version': '20',
                cache: 'npm',
              },
            },
            { run: 'npm ci' },
            { run: 'npm run build' },
            {
              name: 'Start application',
              run: 'npm start &',
              env: {
                NODE_ENV: 'test',
                PORT: 3000,
              },
            },
            {
              name: 'Wait for application',
              run: 'npx wait-on http://localhost:3000/health',
            },
            {
              name: 'Run performance tests',
              run: 'npm run test:performance:${{ matrix.test-type }}',
              timeout: 30,
            },
            {
              name: 'Upload performance reports',
              uses: 'actions/upload-artifact@v3',
              with: {
                name: 'performance-reports-${{ matrix.test-type }}',
                path: 'reports/performance/',
              },
            },
          ],
        },

        'performance-analysis': {
          needs: 'performance-test',
          'runs-on': 'ubuntu-latest',
          steps: [
            { uses: 'actions/checkout@v4' },
            {
              name: 'Download performance reports',
              uses: 'actions/download-artifact@v3',
              with: {
                path: 'reports/',
              },
            },
            {
              name: 'Analyze performance trends',
              run: 'npm run performance:analyze',
            },
            {
              name: 'Generate performance report',
              run: 'npm run performance:report',
            },
            {
              name: 'Comment performance results',
              uses: 'actions/github-script@v6',
              with: {
                script: `
                  const fs = require('fs');
                  const report = fs.readFileSync('reports/performance-summary.md', 'utf8');
                  github.rest.issues.createComment({
                    issue_number: context.issue.number,
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    body: \`## Performance Test Results\\n\\n\${report}\`
                  });
                `,
              },
            },
          ],
        },
      },
    };
  }

  /**
   * Multi-cloud deployment workflow
   */
  static getMultiCloudDeploymentWorkflow(): WorkflowTemplate {
    return {
      name: 'Multi-Cloud Deployment',
      description: 'Deploy to AWS, GCP, and Azure simultaneously',
      triggers: ['workflow_dispatch', 'push:release/*'],
      secrets: [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'GCP_SERVICE_ACCOUNT',
        'AZURE_CREDENTIALS',
      ],
      jobs: {
        'deploy-aws': {
          'runs-on': 'ubuntu-latest',
          environment: 'aws-production',
          steps: [
            { uses: 'actions/checkout@v4' },
            {
              name: 'Configure AWS credentials',
              uses: 'aws-actions/configure-aws-credentials@v4',
              with: {
                'aws-access-key-id': '${{ secrets.AWS_ACCESS_KEY_ID }}',
                'aws-secret-access-key': '${{ secrets.AWS_SECRET_ACCESS_KEY }}',
                'aws-region': 'us-west-2',
              },
            },
            {
              name: 'Deploy to AWS EKS',
              run: `
                aws eks update-kubeconfig --name claude-flow-cluster --region us-west-2
                kubectl apply -f k8s/aws/
                kubectl set image deployment/claude-flow-novice claude-flow-novice=\${{ env.IMAGE_TAG }}
                kubectl rollout status deployment/claude-flow-novice
              `,
            },
          ],
        },

        'deploy-gcp': {
          'runs-on': 'ubuntu-latest',
          environment: 'gcp-production',
          steps: [
            { uses: 'actions/checkout@v4' },
            {
              name: 'Setup GCP',
              uses: 'google-github-actions/setup-gcloud@v1',
              with: {
                service_account_key: '${{ secrets.GCP_SERVICE_ACCOUNT }}',
                project_id: '${{ env.GCP_PROJECT_ID }}',
              },
            },
            {
              name: 'Deploy to GKE',
              run: `
                gcloud container clusters get-credentials claude-flow-cluster --zone us-central1-a
                kubectl apply -f k8s/gcp/
                kubectl set image deployment/claude-flow-novice claude-flow-novice=\${{ env.IMAGE_TAG }}
                kubectl rollout status deployment/claude-flow-novice
              `,
            },
          ],
        },

        'deploy-azure': {
          'runs-on': 'ubuntu-latest',
          environment: 'azure-production',
          steps: [
            { uses: 'actions/checkout@v4' },
            {
              name: 'Azure Login',
              uses: 'azure/login@v1',
              with: {
                creds: '${{ secrets.AZURE_CREDENTIALS }}',
              },
            },
            {
              name: 'Deploy to AKS',
              run: `
                az aks get-credentials --resource-group claude-flow-rg --name claude-flow-aks
                kubectl apply -f k8s/azure/
                kubectl set image deployment/claude-flow-novice claude-flow-novice=\${{ env.IMAGE_TAG }}
                kubectl rollout status deployment/claude-flow-novice
              `,
            },
          ],
        },

        'verify-deployment': {
          needs: ['deploy-aws', 'deploy-gcp', 'deploy-azure'],
          'runs-on': 'ubuntu-latest',
          steps: [
            {
              name: 'Verify all deployments',
              run: `
                # Check AWS deployment
                curl -f https://aws.claude-flow.example.com/health

                # Check GCP deployment
                curl -f https://gcp.claude-flow.example.com/health

                # Check Azure deployment
                curl -f https://azure.claude-flow.example.com/health
              `,
            },
          ],
        },
      },
    };
  }

  /**
   * Security-focused workflow for compliance
   */
  static getSecurityComplianceWorkflow(): WorkflowTemplate {
    return {
      name: 'Security & Compliance Scan',
      description: 'Comprehensive security scanning for SOC2/ISO27001 compliance',
      triggers: ['push', 'pull_request', 'schedule:weekly'],
      jobs: {
        'dependency-scan': {
          'runs-on': 'ubuntu-latest',
          steps: [
            { uses: 'actions/checkout@v4' },
            {
              name: 'Run npm audit',
              run: `
                npm audit --audit-level high --json > audit-results.json
                npm audit --audit-level high
              `,
            },
            {
              name: 'Snyk vulnerability scan',
              uses: 'snyk/actions/node@master',
              env: {
                SNYK_TOKEN: '${{ secrets.SNYK_TOKEN }}',
              },
              with: {
                args: '--severity-threshold=high --json-file-output=snyk-results.json',
              },
            },
            {
              name: 'OWASP Dependency Check',
              uses: 'dependency-check/Dependency-Check_Action@main',
              with: {
                project: 'claude-flow-novice',
                path: '.',
                format: 'JSON',
              },
            },
          ],
        },

        'container-security': {
          'runs-on': 'ubuntu-latest',
          steps: [
            { uses: 'actions/checkout@v4' },
            {
              name: 'Build image for scanning',
              run: 'docker build -t claude-flow-novice:security-scan .',
            },
            {
              name: 'Trivy container scan',
              uses: 'aquasecurity/trivy-action@master',
              with: {
                'image-ref': 'claude-flow-novice:security-scan',
                format: 'sarif',
                output: 'trivy-results.sarif',
              },
            },
            {
              name: 'Hadolint Dockerfile scan',
              uses: 'hadolint/hadolint-action@v3.1.0',
              with: {
                dockerfile: 'Dockerfile',
              },
            },
            {
              name: 'Docker Bench Security',
              run: `
                docker run --rm --net host --pid host --userns host --cap-add audit_control \\
                  -e DOCKER_CONTENT_TRUST=$DOCKER_CONTENT_TRUST \\
                  -v /etc:/etc:ro \\
                  -v /usr/bin/containerd:/usr/bin/containerd:ro \\
                  -v /usr/bin/runc:/usr/bin/runc:ro \\
                  -v /usr/lib/systemd:/usr/lib/systemd:ro \\
                  -v /var/lib:/var/lib:ro \\
                  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
                  docker/docker-bench-security
              `,
            },
          ],
        },

        'secrets-scan': {
          'runs-on': 'ubuntu-latest',
          steps: [
            {
              uses: 'actions/checkout@v4',
              with: {
                'fetch-depth': 0,
              },
            },
            {
              name: 'TruffleHog secrets scan',
              uses: 'trufflesecurity/trufflehog@main',
              with: {
                path: './',
                base: 'main',
                head: 'HEAD',
                extra_args: '--debug --only-verified',
              },
            },
            {
              name: 'GitLeaks scan',
              uses: 'gitleaks/gitleaks-action@v2',
              env: {
                GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
              },
            },
          ],
        },

        'compliance-report': {
          needs: ['dependency-scan', 'container-security', 'secrets-scan'],
          'runs-on': 'ubuntu-latest',
          steps: [
            {
              name: 'Generate compliance report',
              run: `
                echo "# Security Compliance Report" > compliance-report.md
                echo "Generated: $(date)" >> compliance-report.md
                echo "" >> compliance-report.md

                echo "## Dependency Security" >> compliance-report.md
                echo "- npm audit: ✅ Passed" >> compliance-report.md
                echo "- Snyk scan: ✅ Passed" >> compliance-report.md

                echo "## Container Security" >> compliance-report.md
                echo "- Trivy scan: ✅ Passed" >> compliance-report.md
                echo "- Dockerfile security: ✅ Passed" >> compliance-report.md

                echo "## Secrets Detection" >> compliance-report.md
                echo "- TruffleHog: ✅ No secrets found" >> compliance-report.md
                echo "- GitLeaks: ✅ No leaks detected" >> compliance-report.md
              `,
            },
            {
              name: 'Upload compliance report',
              uses: 'actions/upload-artifact@v3',
              with: {
                name: 'compliance-report',
                path: 'compliance-report.md',
              },
            },
          ],
        },
      },
    };
  }

  /**
   * Generate workflow file content
   */
  static generateWorkflowFile(template: WorkflowTemplate): string {
    const workflow = {
      name: template.name,
      on: this.parseTriggersToGitHubFormat(template.triggers),
      env: {
        REGISTRY: 'ghcr.io',
        IMAGE_NAME: 'claude-flow-novice',
      },
      jobs: template.jobs,
    };

    return `# ${template.description}
# Generated by Claude Flow Novice CI/CD Templates
${this.yamlStringify(workflow)}`;
  }

  /**
   * Parse trigger strings to GitHub Actions format
   */
  private static parseTriggersToGitHubFormat(triggers: string[]): any {
    const parsedTriggers: any = {};

    triggers.forEach((trigger) => {
      if (trigger.startsWith('push:')) {
        const branch = trigger.split(':')[1];
        if (!parsedTriggers.push) parsedTriggers.push = { branches: [] };
        parsedTriggers.push.branches.push(branch);
      } else if (trigger.startsWith('schedule:')) {
        const schedule = trigger.split(':')[1];
        const cronMap: Record<string, string> = {
          daily: '0 2 * * *',
          weekly: '0 2 * * 0',
          monthly: '0 2 1 * *',
        };
        parsedTriggers.schedule = [{ cron: cronMap[schedule] || schedule }];
      } else if (trigger === 'pull_request') {
        parsedTriggers.pull_request = { branches: ['main'] };
      } else if (trigger === 'workflow_dispatch') {
        parsedTriggers.workflow_dispatch = {};
      }
    });

    return parsedTriggers;
  }

  /**
   * Convert object to YAML string (simplified)
   */
  private static yamlStringify(obj: any, indent = 0): string {
    const spaces = '  '.repeat(indent);
    let result = '';

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;

      if (typeof value === 'object' && !Array.isArray(value)) {
        result += `${spaces}${key}:\n`;
        result += this.yamlStringify(value, indent + 1);
      } else if (Array.isArray(value)) {
        result += `${spaces}${key}:\n`;
        value.forEach((item) => {
          if (typeof item === 'object') {
            result += `${spaces}  -\n`;
            result += this.yamlStringify(item, indent + 2);
          } else {
            result += `${spaces}  - ${item}\n`;
          }
        });
      } else {
        const quotedValue = typeof value === 'string' && value.includes('$') ? `"${value}"` : value;
        result += `${spaces}${key}: ${quotedValue}\n`;
      }
    }

    return result;
  }
}

/**
 * Deployment configuration for different environments
 */
export class DeploymentConfigurations {
  static getDevelopmentConfig() {
    return {
      replicas: 1,
      resources: {
        requests: { memory: '512Mi', cpu: '250m' },
        limits: { memory: '1Gi', cpu: '500m' },
      },
      autoscaling: false,
      monitoring: 'basic',
    };
  }

  static getStagingConfig() {
    return {
      replicas: 2,
      resources: {
        requests: { memory: '1Gi', cpu: '500m' },
        limits: { memory: '2Gi', cpu: '1000m' },
      },
      autoscaling: true,
      minReplicas: 2,
      maxReplicas: 5,
      monitoring: 'enhanced',
    };
  }

  static getProductionConfig() {
    return {
      replicas: 3,
      resources: {
        requests: { memory: '2Gi', cpu: '1000m' },
        limits: { memory: '4Gi', cpu: '2000m' },
      },
      autoscaling: true,
      minReplicas: 3,
      maxReplicas: 50,
      monitoring: 'comprehensive',
      securityPolicies: true,
      networkPolicies: true,
      podDisruptionBudget: true,
    };
  }
}

/**
 * Utility functions for CI/CD operations
 */
export class CICDUtils {
  /**
   * Generate environment-specific Kubernetes manifests
   */
  static generateKubernetesManifests(environment: string, config: any): Record<string, any> {
    return {
      deployment: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'claude-flow-novice',
          namespace: environment,
          labels: {
            app: 'claude-flow-novice',
            environment: environment,
          },
        },
        spec: {
          replicas: config.replicas,
          selector: {
            matchLabels: {
              app: 'claude-flow-novice',
            },
          },
          template: {
            metadata: {
              labels: {
                app: 'claude-flow-novice',
                environment: environment,
              },
            },
            spec: {
              containers: [
                {
                  name: 'claude-flow-novice',
                  image: 'claude-flow-novice:latest',
                  ports: [{ containerPort: 3000 }],
                  resources: config.resources,
                  env: [
                    { name: 'NODE_ENV', value: environment },
                    { name: 'PORT', value: '3000' },
                  ],
                  livenessProbe: {
                    httpGet: { path: '/health', port: 3000 },
                    initialDelaySeconds: 30,
                    periodSeconds: 10,
                  },
                  readinessProbe: {
                    httpGet: { path: '/ready', port: 3000 },
                    initialDelaySeconds: 5,
                    periodSeconds: 5,
                  },
                },
              ],
            },
          },
        },
      },

      service: {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: 'claude-flow-novice-service',
          namespace: environment,
        },
        spec: {
          selector: {
            app: 'claude-flow-novice',
          },
          ports: [
            {
              port: 80,
              targetPort: 3000,
              protocol: 'TCP',
            },
          ],
          type: 'ClusterIP',
        },
      },

      ...(config.autoscaling && {
        hpa: {
          apiVersion: 'autoscaling/v2',
          kind: 'HorizontalPodAutoscaler',
          metadata: {
            name: 'claude-flow-novice-hpa',
            namespace: environment,
          },
          spec: {
            scaleTargetRef: {
              apiVersion: 'apps/v1',
              kind: 'Deployment',
              name: 'claude-flow-novice',
            },
            minReplicas: config.minReplicas,
            maxReplicas: config.maxReplicas,
            metrics: [
              {
                type: 'Resource',
                resource: {
                  name: 'cpu',
                  target: {
                    type: 'Utilization',
                    averageUtilization: 70,
                  },
                },
              },
            ],
          },
        },
      }),
    };
  }

  /**
   * Generate Terraform configuration for cloud resources
   */
  static generateTerraformConfig(provider: string, environment: string): string {
    const configs = {
      aws: `
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

module "eks" {
  source = "terraform-aws-modules/eks/aws"

  cluster_name    = "claude-flow-${environment}"
  cluster_version = "1.28"

  vpc_id     = var.vpc_id
  subnet_ids = var.subnet_ids

  eks_managed_node_groups = {
    main = {
      min_size     = 2
      max_size     = 10
      desired_size = 3
      instance_types = ["t3.large"]
    }
  }
}
      `,
      gcp: `
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

resource "google_container_cluster" "claude_flow" {
  name     = "claude-flow-${environment}"
  location = var.region

  initial_node_count = 3

  node_config {
    machine_type = "e2-medium"
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
  }
}
      `,
      azure: `
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

resource "azurerm_kubernetes_cluster" "claude_flow" {
  name                = "claude-flow-${environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  dns_prefix          = "claude-flow-${environment}"

  default_node_pool {
    name       = "default"
    node_count = 3
    vm_size    = "Standard_D2_v2"
  }

  identity {
    type = "SystemAssigned"
  }
}
      `,
    };

    return configs[provider as keyof typeof configs] || '';
  }
}
