# Marketing Platform API Research

## Overview
This document provides comprehensive API integration patterns for key marketing platforms, focusing on authentication, endpoint details, and integration strategies.

## API Documentation Index

### 1. Mailchimp API v3.0 (Campaign Management)
- **Base URL:** `https://us1.api.mailchimp.com/3.0/`
- **Authentication:** OAuth 2.0 / API Key
- **Key Endpoints:**
  - `GET /campaigns`: List campaigns
  - `POST /campaigns`: Create new campaign
  - `PUT /campaigns/{campaign_id}`: Update campaign
  - **OAuth Scopes:** 
    - `campaigns.readonly`: View campaigns
    - `campaigns.manage`: Create and modify campaigns
- **Rate Limits:** 
  - 500 requests per hour
  - 10 concurrent requests

### 2. SendGrid API v3 (Email Sending)
- **Base URL:** `https://api.sendgrid.com/v3/`
- **Authentication:** Bearer Token
- **Key Endpoints:**
  - `POST /mail/send`: Send email
  - `GET /marketing/contacts`: Manage contacts
  - **OAuth Scopes:**
    - `mail.send`: Send emails
    - `marketing.contacts`: Manage contact lists
- **Rate Limits:**
  - 100 requests per second
  - 100,000 emails per month (free tier)

### 3. HubSpot Email API
- **Base URL:** `https://api.hubapi.com/marketing/v3/`
- **Authentication:** OAuth 2.0
- **Key Endpoints:**
  - `POST /emails/single-send`: Send single email
  - `GET /email/public/v1/campaigns`: List email campaigns
  - **OAuth Scopes:**
    - `conversations.read`
    - `marketing.campaigns.read`
    - `marketing.emails.send`
- **Rate Limits:**
  - 100 requests per 10 seconds
  - Daily quota based on account tier

### 4. Meta Graph API v18.0 (Facebook/Instagram Posting)
- **Base URL:** `https://graph.facebook.com/v18.0/`
- **Authentication:** OAuth 2.0
- **Key Endpoints:**
  - `POST /{page_id}/feed`: Create post
  - `POST /{instagram_account_id}/media`: Create Instagram media
  - **OAuth Scopes:**
    - `pages_manage_posts`
    - `pages_read_engagement`
    - `instagram_basic`
- **Rate Limits:**
  - 200 calls per user per hour
  - Different limits for different endpoint types

### 5. LinkedIn Marketing API v2
- **Base URL:** `https://api.linkedin.com/v2/`
- **Authentication:** OAuth 2.0
- **Key Endpoints:**
  - `POST /shares`: Create share
  - `GET /organizationalEntityAds`: Manage ads
  - **OAuth Scopes:**
    - `w_member_social`
    - `r_ads`
    - `r_organization_social`
- **Rate Limits:**
  - 100,000 API calls per day
  - 25,000 calls per 24 hours for most endpoints

### 6. Twitter API v2
- **Base URL:** `https://api.twitter.com/2/`
- **Authentication:** OAuth 2.0 Bearer Token
- **Key Endpoints:**
  - `POST /tweets`: Create tweet
  - `GET /tweets/search/recent`: Search tweets
  - **OAuth Scopes:**
    - `tweet.read`
    - `tweet.write`
    - `users.read`
- **Rate Limits:**
  - 500,000 tweets per month
  - 1,500 requests per 15-minute window

### 7. TikTok for Business API
- **Base URL:** `https://business-api.tiktok.com/`
- **Authentication:** OAuth 2.0
- **Key Endpoints:**
  - `POST /post/create`: Create post
  - `GET /ad/get`: Retrieve ad information
  - **OAuth Scopes:**
    - `ad_management`
    - `user_profile`
- **Rate Limits:**
  - 2,000 calls per day
  - 60 calls per minute

### 8. Google Analytics 4 API
- **Base URL:** `https://analyticsdata.googleapis.com/v1beta/`
- **Authentication:** OAuth 2.0
- **Key Endpoints:**
  - `POST /properties/{propertyId}:runReport`: Generate report
  - `GET /properties`: List properties
  - **OAuth Scopes:**
    - `https://www.googleapis.com/auth/analytics.readonly`
- **Rate Limits:**
  - 50,000 requests per day
  - 10 requests per second

### 9. HubSpot CRM API
- **Base URL:** `https://api.hubapi.com/crm/v3/`
- **Authentication:** OAuth 2.0
- **Key Endpoints:**
  - `POST /objects/contacts`: Create contact
  - `GET /objects/contacts/{contactId}`: Get contact details
  - **OAuth Scopes:**
    - `crm.objects.contacts.read`
    - `crm.objects.contacts.write`
- **Rate Limits:**
  - 100 requests per 10 seconds
  - Daily quota based on account tier

### 10. Salesforce REST API v58.0
- **Base URL:** `https://{instance}.salesforce.com/services/data/v58.0/`
- **Authentication:** OAuth 2.0
- **Key Endpoints:**
  - `POST /sobjects/{object}/`: Create record
  - `PATCH /sobjects/{object}/{id}`: Update record
  - **OAuth Scopes:**
    - `full`
    - `api`
    - `web`
- **Rate Limits:**
  - 15,000 API requests per day (Professional Edition)
  - Concurrent request limit: 10

## Common Integration Patterns
1. Use OAuth 2.0 for secure authentication
2. Implement exponential backoff for rate limit handling
3. Store and refresh access tokens securely
4. Use least-privilege OAuth scopes
5. Log and monitor API interactions

## Recommendations
- Always use HTTPS
- Implement robust error handling
- Cache access tokens
- Monitor rate limit usage
- Use SDK when available
