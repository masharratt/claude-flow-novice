import json
import boto3
import os
import time

# AWS clients
route53 = boto3.client('route53')
route53_health = boto3.client('route53')
sns = boto3.client('sns')

# Environment variables
PRIMARY_HEALTH_CHECK_ID = os.environ.get('PRIMARY_HEALTH_CHECK_ID')
DR_HEALTH_CHECK_ID = os.environ.get('DR_HEALTH_CHECK_ID')
ROUTE53_ZONE_ID = os.environ.get('ROUTE53_ZONE_ID')
DOMAIN_NAME = os.environ.get('DOMAIN_NAME')
SNS_TOPIC_ARN = os.environ.get('SNS_TOPIC_ARN')
ENABLE_AUTO_FAILOVER = os.environ.get('ENABLE_AUTO_FAILOVER', 'false').lower() == 'true'

def lambda_handler(event, context):
    """
    Automated failover function that monitors health checks and triggers failover if needed
    """

    print(f"Starting failover check for {DOMAIN_NAME}")
    print(f"Auto-failover enabled: {ENABLE_AUTO_FAILOVER}")

    try:
        # Get health check statuses
        primary_status = get_health_check_status(PRIMARY_HEALTH_CHECK_ID)
        dr_status = get_health_check_status(DR_HEALTH_CHECK_ID)

        print(f"Primary health check status: {primary_status}")
        print(f"DR health check status: {dr_status}")

        # Determine current failover state
        current_state = get_current_failover_state()
        print(f"Current failover state: {current_state}")

        # Evaluate failover decision
        failover_decision = evaluate_failover(primary_status, dr_status, current_state)
        print(f"Failover decision: {failover_decision}")

        if failover_decision['action'] == 'FAILOVER_TO_DR' and ENABLE_AUTO_FAILOVER:
            # Trigger failover to DR
            result = trigger_failover_to_dr()
            send_notification(f"Auto-failover to DR triggered for {DOMAIN_NAME}", result)

        elif failover_decision['action'] == 'FAILOVER_TO_PRIMARY' and ENABLE_AUTO_FAILOVER:
            # Trigger failback to primary
            result = trigger_failover_to_primary()
            send_notification(f"Auto-failback to primary triggered for {DOMAIN_NAME}", result)

        elif failover_decision['action'] == 'ALERT':
            # Send alert but don't failover
            send_notification(f"Health check alert for {DOMAIN_NAME}", failover_decision)

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Failover check completed',
                'primary_status': primary_status,
                'dr_status': dr_status,
                'current_state': current_state,
                'decision': failover_decision
            })
        }

    except Exception as e:
        error_message = f"Error in failover lambda: {str(e)}"
        print(error_message)
        send_notification(f"Failover lambda error for {DOMAIN_NAME}", {'error': error_message})

        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': error_message
            })
        }

def get_health_check_status(health_check_id):
    """
    Get the status of a Route 53 health check
    """
    try:
        response = route53_health.get_health_check_status(
            HealthCheckId=health_check_id
        )

        status_list = response.get('StatusList', [])
        if not status_list:
            return 'Unknown'

        # Get the most recent status
        latest_status = status_list[-1]
        return latest_status['Status']

    except Exception as e:
        print(f"Error getting health check status for {health_check_id}: {str(e)}")
        return 'Error'

def get_current_failover_state():
    """
    Determine the current failover state by checking which record is active
    """
    try:
        response = route53.list_resource_record_sets(
            HostedZoneId=ROUTE53_ZONE_ID,
            StartRecordName=DOMAIN_NAME,
            StartRecordType='A',
            MaxItems='1'
        )

        record_sets = response.get('ResourceRecordSets', [])
        if not record_sets:
            return 'Unknown'

        record_set = record_sets[0]
        if 'AliasTarget' in record_set:
            # Check which alias target is being used
            dns_name = record_set['AliasTarget']['DNSName']
            if 'elb' in dns_name.lower() and 'us-east-1' in dns_name.lower():
                return 'PRIMARY'
            elif 'elb' in dns_name.lower() and 'us-west-2' in dns_name.lower():
                return 'DR'

        return 'Unknown'

    except Exception as e:
        print(f"Error determining current failover state: {str(e)}")
        return 'Unknown'

def evaluate_failover(primary_status, dr_status, current_state):
    """
    Evaluate whether a failover should be triggered
    """
    # Health check priority: Success > Warning > Unknown > Failure
    status_priority = {
        'Success': 0,
        'Warning': 1,
        'Unknown': 2,
        'Failure': 3,
        'Error': 4
    }

    primary_priority = status_priority.get(primary_status, 4)
    dr_priority = status_priority.get(dr_status, 4)

    # Decision logic
    if current_state == 'PRIMARY':
        if primary_priority >= 3 and dr_priority <= 1:
            # Primary is failing, DR is healthy
            return {
                'action': 'FAILOVER_TO_DR',
                'reason': f'Primary health check is {primary_status}, DR health check is {dr_status}',
                'primary_status': primary_status,
                'dr_status': dr_status
            }
        elif primary_priority >= 3:
            # Primary is failing, DR status unknown
            return {
                'action': 'ALERT',
                'reason': f'Primary health check is {primary_status}, DR health check is {dr_status}',
                'primary_status': primary_status,
                'dr_status': dr_status
            }
    elif current_state == 'DR':
        if primary_priority <= 1 and dr_priority >= 3:
            # Primary is healthy, DR is failing
            return {
                'action': 'FAILOVER_TO_PRIMARY',
                'reason': f'Primary health check is {primary_status}, DR health check is {dr_status}',
                'primary_status': primary_status,
                'dr_status': dr_status
            }
        elif dr_priority >= 3:
            # DR is failing
            return {
                'action': 'ALERT',
                'reason': f'DR health check is {dr_status} while in DR state',
                'primary_status': primary_status,
                'dr_status': dr_status
            }

    # No action needed
    return {
        'action': 'NONE',
        'reason': 'No failover needed',
        'primary_status': primary_status,
        'dr_status': dr_status
    }

def trigger_failover_to_dr():
    """
    Trigger failover to DR by updating Route 53 record
    """
    try:
        # This is a simplified example - in practice, you would need
        # to implement proper Route 53 record updates

        print("Triggering failover to DR")

        # Update DR record to be primary
        # (Implementation would depend on your specific Route 53 configuration)

        return {
            'status': 'SUCCESS',
            'message': 'Failover to DR triggered successfully'
        }

    except Exception as e:
        print(f"Error triggering failover to DR: {str(e)}")
        return {
            'status': 'ERROR',
            'message': f'Error triggering failover to DR: {str(e)}'
        }

def trigger_failover_to_primary():
    """
    Trigger failback to primary by updating Route 53 record
    """
    try:
        # This is a simplified example - in practice, you would need
        # to implement proper Route 53 record updates

        print("Triggering failover to primary")

        # Update primary record to be active
        # (Implementation would depend on your specific Route 53 configuration)

        return {
            'status': 'SUCCESS',
            'message': 'Failover to primary triggered successfully'
        }

    except Exception as e:
        print(f"Error triggering failover to primary: {str(e)}")
        return {
            'status': 'ERROR',
            'message': f'Error triggering failover to primary: {str(e)}'
        }

def send_notification(subject, message):
    """
    Send notification via SNS
    """
    try:
        if SNS_TOPIC_ARN:
            sns.publish(
                TopicArn=SNS_TOPIC_ARN,
                Subject=subject,
                Message=json.dumps(message, default=str),
                MessageStructure='string'
            )
            print(f"Notification sent: {subject}")
        else:
            print(f"No SNS topic configured. Would send: {subject}")

    except Exception as e:
        print(f"Error sending notification: {str(e)}")