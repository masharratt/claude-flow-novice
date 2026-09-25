# OAuth Scopes Security Reference

## Overview
This document provides a comprehensive guide to OAuth scopes, focusing on least privilege principles and security best practices for marketing platform APIs.

## Least Privilege Principles
1. Only request scopes required for specific operations
2. Minimize scope breadth
3. Regularly audit and rotate access tokens
4. Use token revocation mechanisms
5. Implement strict token lifecycle management

## Platform-Specific OAuth Scope Strategies

### 1. Mailchimp API
- **Recommended Scopes:**
  - `campaigns.readonly` - For read-only campaign access
  - `campaigns.manage` - For campaign creation/modification
- **Security Considerations:**
  - Separate read and write permissions
  - Avoid using `full` or `admin` scopes

### 2. SendGrid
- **Recommended Scopes:**
  - `mail.send` - Strictly for sending emails
  - `marketing.contacts.read` - Read-only contact access
  - `marketing.contacts.write` - Modify contact lists
- **Security Considerations:**
  - Use separate tokens for sending and contact management
  - Implement IP restrictions

### 3. HubSpot
- **Recommended Scopes:**
  - `marketing.campaigns.read`
  - `marketing.emails.send`
  - `crm.objects.contacts.read`
- **Security Considerations:**
  - Granular scope selection
  - Use application-specific tokens

### 4. Meta Graph API
- **Recommended Scopes:**
  - `pages_read_engagement` - Analytics only
  - `pages_manage_posts` - Posting permissions
  - `instagram_basic` - Limited Instagram access
- **Security Considerations:**
  - Limit platform-specific permissions
  - Regularly review app permissions

### 5. LinkedIn Marketing
- **Recommended Scopes:**
  - `r_organization_social` - Organizational posting
  - `r_ads` - Read-only ad management
- **Security Considerations:**
  - Use organizational accounts
  - Implement multi-factor authentication

### 6. Twitter API
- **Recommended Scopes:**
  - `tweet.read` - Read tweets
  - `tweet.write` - Create tweets
  - `users.read` - Basic user information
- **Security Considerations:**
  - Separate read and write tokens
  - Use developer account restrictions

### 7. TikTok Business API
- **Recommended Scopes:**
  - `ad_management` - Limited ad operations
  - `user_profile` - Basic profile access
- **Security Considerations:**
  - Limit ad management scope
  - Use business account isolation

### 8. Google Analytics
- **Recommended Scopes:**
  - `https://www.googleapis.com/auth/analytics.readonly`
- **Security Considerations:**
  - Read-only access
  - Use service accounts for automation

### 9. HubSpot CRM
- **Recommended Scopes:**
  - `crm.objects.contacts.read`
  - `crm.objects.contacts.write`
- **Security Considerations:**
  - Separate read/write permissions
  - Implement contact data protection

### 10. Salesforce
- **Recommended Scopes:**
  - `api` - Basic API access
  - `web` - Web interactions
  - Avoid `full` scope
- **Security Considerations:**
  - Use IP whitelisting
  - Implement token rotation

## Token Management Best Practices
1. Store tokens securely (encrypted storage)
2. Implement short-lived tokens
3. Use refresh tokens with strict rotation
4. Monitor token usage and revoke suspicious tokens
5. Log all token-related activities

## Error Handling for OAuth
- Handle 401 (Unauthorized) gracefully
- Implement automatic token refresh
- Provide clear error messaging without exposing sensitive details
- Log authentication failures

## Compliance and Audit
- Maintain detailed logs of scope usage
- Perform quarterly access reviews
- Document token issuance and revocation
- Follow GDPR, CCPA data handling guidelines

## Recommended Implementation Pattern
```bash
# Example bash token request with strict scopes
oauth_request() {
  curl -X POST https://api.platform.com/oauth/token \
    -d "grant_type=authorization_code" \
    -d "scope=read:campaigns,write:emails" \
    -d "client_id=$CLIENT_ID" \
    -d "client_secret=$CLIENT_SECRET"
}
```

## Monitoring and Alerts
- Set up alerts for:
  - Unusual token usage
  - Repeated authentication failures
  - Scope elevation attempts
