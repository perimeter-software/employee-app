# 🚀 Deployment Setup Guide

This guide will help you configure your GitHub repository and AWS environment variables to fix the "baseURL is required" error.

## 🔧 GitHub Repository Configuration

You need to set up the following variables and secrets in your GitHub repository:

### 📍 Repository Variables (`vars`)
Go to your GitHub repo → Settings → Secrets and variables → Actions → Variables tab

```bash
# Auth0 Configuration
AUTH0_BASE_URL=https://your-production-domain.com
AUTH0_ISSUER_BASE_URL=https://your-auth0-domain.us.auth0.com
AUTH0_CLIENT_ID=your_auth0_client_id
AUTH0_AUDIENCE=https://your-auth0-domain.us.auth0.com/api/v2/

# API Configuration
NEXT_PUBLIC_API_URL=https://your-production-domain.com/api

# Redis Configuration
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_URL=redis://your-redis-host:6379

# Legacy Auth0 (for backward compatibility)
SECRET_AUTH0_CLIENT_ID=your_auth0_client_id
SECRET_AUTH0_DOMAIN=your-auth0-domain.auth0.com
SECRET_AUTH0_AUDIENCE=https://your-production-domain.com

# AWS Configuration
AWS_REGION=us-east-1
```

### 🔐 Repository Secrets (`secrets`)
Go to your GitHub repo → Settings → Secrets and variables → Actions → Secrets tab

```bash
# Auth0 Secrets
AUTH0_SECRET=your_auth0_secret_here
AUTH0_CLIENT_SECRET=your_auth0_client_secret

# Database
MONGODB_CONNECTION_STRING=your_mongodb_connection_string

# Google Maps API Keys  
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
GOOGLE_MAPS_API_KEY_TWO=your_second_google_maps_api_key

# AI API Keys
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# Legacy Auth0 Secrets
SECRET_AUTH0_CLIENT_SECRET=your_auth0_client_secret
SECRET_AUTH0_SERVER_SECRET=your_auth0_server_secret
```

## 🎯 Critical Fix Required

**The most important change you need to make:**

Replace `https://your-production-domain.com` with your actual production domain. For example:
- If your app deploys to `https://employee-app-dev.us-east-1.elasticbeanstalk.com`
- Set `AUTH0_BASE_URL=https://employee-app-dev.us-east-1.elasticbeanstalk.com`

## 🔍 How to Find Your Production Domain

1. **Check your AWS Elastic Beanstalk console**:
   - Go to AWS Console → Elastic Beanstalk
   - Find your `employee-app-dev` environment
   - Copy the environment URL (something like `http://employee-app-dev.us-east-1.elasticbeanstalk.com`)

2. **Or check your previous deployments**:
   - Look at the GitHub Actions logs
   - Check the AWS EB environment details

## 🚨 What Was Causing the Error

The "baseURL is required" error was happening because:

1. ❌ **Missing `AUTH0_ISSUER_BASE_URL`** in the deployment
2. ❌ **`AUTH0_BASE_URL` was not set** or set incorrectly in production  
3. ❌ **Using deprecated `AUTH0_DOMAIN`** instead of proper v3+ variables

## ✅ After Setting Up Variables

1. **Re-run your GitHub Actions deployment**
2. **Check the health endpoint**: `https://your-domain.com/api/health`
3. **The health check should now show**:
   ```json
   {
     "services": {
       "auth": {
         "status": "healthy",
         "configured": true
       }
     }
   }
   ```

## 🛠️ Testing Locally

You can test the environment checker locally:

```bash
# Check your local environment
node scripts/check-env.js

# Check health endpoint (if running locally)
curl http://localhost:3000/api/health | jq
```

## 📋 Deployment Checklist

- [ ] Set all GitHub repository variables
- [ ] Set all GitHub repository secrets  
- [ ] Update `AUTH0_BASE_URL` to production domain
- [ ] Verify `AUTH0_ISSUER_BASE_URL` is set
- [ ] Re-run GitHub Actions deployment
- [ ] Check `/api/health` endpoint
- [ ] Test Auth0 login in production

## 🆘 Still Having Issues?

If you're still seeing errors after this setup:

1. **Check AWS EB Environment Variables**:
   ```bash
   aws elasticbeanstalk describe-configuration-settings \
     --application-name employee-app \
     --environment-name employee-app-dev
   ```

2. **Check the health endpoint** for detailed error messages
3. **Look at the AWS EB logs** for any remaining configuration issues

The key fix is ensuring `AUTH0_BASE_URL` matches your actual production domain! 🎯

## 🔒 Security Note

**Never commit actual API keys or secrets to your repository!**

- Use GitHub Secrets for sensitive values
- Use environment variables in production
- Keep `.env` files in `.gitignore`
- Use placeholder values in documentation
