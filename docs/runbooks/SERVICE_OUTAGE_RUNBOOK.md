# Service Outage Runbook

## Overview
This runbook provides step-by-step instructions for responding to complete service outages in the Claude Flow Novice dashboard.

## Trigger Conditions
- All users unable to access the dashboard
- Health checks failing across all instances
- Service availability < 50%
- Complete application failure

## Initial Assessment (Minutes 0-5)

### 1. Verify the Outage
```bash
# Check service status
curl -I https://dashboard.claude-flow-novice.com/health

# Check DNS resolution
nslookup dashboard.claude-flow-novice.com

# Check network connectivity
ping 8.8.8.8

# Verify AWS services status
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name TargetConnectionErrorCount \
  --dimensions Name=LoadBalancer,Value=app/dashboard-alb/1234567890abcdef \
  --start-time $(date -u -v-5M +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 60 \
  --statistics Sum
```

### 2. Determine Scope
- [ ] All users affected?
- [ ] Specific geographic regions?
- [ ] All functionalities down?
- [ ] Recent changes deployed?

### 3. Declare Incident
```bash
# Send incident notification
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"🚨 SEV1 INCIDENT: Service Outage - Dashboard completely inaccessible. Investigation started."}' \
  $SLACK_WEBHOOK_URL

# Log incident in tracking system
# Update status page
# Notify incident commander
```

## Investigation (Minutes 5-15)

### 1. Check Load Balancer Status
```bash
# Get ALB health check status
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/dashboard-tg/1234567890abcdef

# Check ALB metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_Target_5XX_Count \
  --dimensions Name=LoadBalancer,Value=app/dashboard-alb/1234567890abcdef \
  --start-time $(date -u -v-15M +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Sum
```

### 2. Check Auto Scaling Group
```bash
# Get ASG status
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names claude-flow-novice-production-dashboard-asg

# Check instance health
aws autoscaling describe-auto-scaling-instances \
  --instance-ids i-1234567890abcdef0

# Check scaling activities
aws autoscaling describe-scaling-activities \
  --auto-scaling-group-name claude-flow-novice-production-dashboard-asg
```

### 3. Check Recent Deployments
```bash
# Check recent deployment history
aws codepipeline get-pipeline-execution-history \
  --pipeline-name claude-flow-novice-deployment \
  --max-count 5

# Check ECS service status (if applicable)
aws ecs describe-services \
  --cluster claude-flow-novice \
  --services dashboard-service

# Check EC2 instance status
aws ec2 describe-instance-status \
  --instance-ids i-1234567890abcdef0
```

### 4. Check Database Connectivity
```bash
# Check RDS instance status
aws rds describe-db-instances \
  --db-instance-identifier claude-flow-novice-primary-db

# Check database connectivity
mysql -h claude-flow-novice-primary-db.cluster-abcdefg12345.us-east-1.rds.amazonaws.com \
  -u admin -p -e "SELECT 1"

# Check database metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=claude-flow-novice-primary-db \
  --start-time $(date -u -v-15M +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average
```

## Mitigation Strategies (Minutes 15-30)

### Strategy 1: Rollback Recent Deployment
```bash
# If deployment occurred within last 30 minutes
aws codepipeline rollback-stage \
  --pipeline-name claude-flow-novice-deployment \
  --stage-name Deploy

# Or manually deploy previous version
aws ecs update-service \
  --cluster claude-flow-novice \
  --service dashboard-service \
  --task-definition dashboard-task-def:123
```

### Strategy 2: Scale Up Infrastructure
```bash
# Increase Auto Scaling Group capacity
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name claude-flow-novice-production-dashboard-asg \
  --desired-capacity 6 \
  --honor-cooldown

# Check instance launch progress
watch aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names claude-flow-novice-production-dashboard-asg
```

### Strategy 3: Restart Services
```bash
# Connect to instances and restart services
ssh -i ~/.ssh/dashboard-key.pem ec2-user@INSTANCE_IP

# Restart application service
sudo systemctl restart dashboard-app
sudo systemctl status dashboard-app

# Restart web server
sudo systemctl restart nginx
sudo systemctl status nginx

# Check logs
sudo journalctl -u dashboard-app -f
sudo tail -f /var/log/nginx/error.log
```

### Strategy 4: Database Recovery
```bash
# If database issues detected
# Check database connectivity from application tier
mysql -h CLUSTER_ENDPOINT -u admin -p -e "SELECT NOW()"

# Restart database if needed
aws rds reboot-db-instance \
  --db-instance-identifier claude-flow-novice-primary-db

# Fail over to read replica (if primary fails)
aws rds promote-read-replica \
  --db-instance-identifier claude-flow-novice-dr-read-replica
```

## Escalation Procedures

### When to Escalate (After 30 minutes)
- Service not restored
- Root cause unknown
- Multiple components failing
- Data loss suspected

### Escalation Steps
1. Notify incident commander
2. Engage subject matter experts
3. Consider disaster recovery failover
4. Management notification

## Disaster Recovery Failover (If all else fails)

### Pre-Failover Checks
- [ ] DR region infrastructure healthy
- [ ] Database replication status verified
- [ ] DNS failover tested
- [ ] Stakeholders notified

### Execute Failover
```bash
# Update Route 53 to point to DR region
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1ABCDEF123456 \
  --change-batch file://failover-change.json

# Verify failover
nslookup dashboard.claude-flow-novice.com
curl -I https://dashboard.claude-flow-novice.com/health
```

## Verification and Monitoring

### Service Restoration Checks
```bash
# Health check
curl https://dashboard.claude-flow-novice.com/health

# Functionality tests
curl -X POST https://dashboard.claude-flow-novice.com/api/test \
  -H "Content-Type: application/json" \
  -d '{"test": "connectivity"}'

# Performance checks
curl -w "@curl-format.txt" -o /dev/null -s \
  https://dashboard.claude-flow-novice.com/api/status
```

### Monitoring Enhancement
```bash
# Increase monitoring frequency
aws cloudwatch put-metric-alarm \
  --alarm-name dashboard-recovery-monitoring \
  --alarm-description "Enhanced monitoring during recovery" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 60 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# Set up additional logging
aws logs create-log-group \
  --log-group-name /aws/ec2/dashboard-recovery
```

## Communication Templates

### Status Update (Every 15 minutes)
```
📊 SERVICE OUTAGE UPDATE

Status: Investigating
Duration: XX minutes
Impact: Complete service outage
Progress: [What we've learned]
Next Steps: [What we're doing]
ETA: Unknown at this time
```

### Resolution Notification
```
✅ SERVICE RESTORED

Outage Duration: XX minutes
Root Cause: [Brief description]
Resolution: [What we did]
Impact: [Duration and affected users]
Next Steps: Monitoring and investigation
```

## Post-Incident Actions

### Immediate (T+0 to T+1 hour)
- [ ] Service stability confirmed
- [ ] Enhanced monitoring active
- [ ] Initial incident log completed

### Short-term (T+1 to T+24 hours)
- [ ] Root cause analysis completed
- [ ] Post-mortem report written
- [ ] Preventive measures identified
- [ ] Monitoring/alerts updated

### Long-term (T+24 hours to T+30 days)
- [ ] Preventive measures implemented
- [ ] Runbooks updated
- [ ] Team training conducted
- [ ] Process improvements made

## Contacts and Escalation

### Primary Contacts
- On-Call Engineer: [Phone/Slack]
- Incident Commander: [Phone/Slack]
- Database Team: [Slack channel]
- Network Team: [Slack channel]

### Escalation Contacts
- Management: [Phone/Email]
- Security Team: [Phone/Email]
- External Support: [Contact information]

---

**Runbook Version**: 1.0
**Last Updated**: [Date]
**Next Review**: [Date]
**Approved By**: [Name/Title]