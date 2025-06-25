#!/usr/bin/env node

/**
 * Pre-deployment verification script
 * Run this script to verify all environment variables and configurations
 * before deploying to Elastic Beanstalk
 */

const { config } = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
config();

console.log('🔍 Pre-deployment Verification Script');
console.log('=====================================\n');

// Required Auth0 environment variables
const requiredEnvVars = [
  'AUTH0_BASE_URL',
  'AUTH0_ISSUER_BASE_URL', 
  'AUTH0_CLIENT_ID',
  'AUTH0_CLIENT_SECRET',
  'AUTH0_SECRET',
  'AUTH0_AUDIENCE'
];

let hasErrors = false;

console.log('1. ✅ Checking Auth0 Environment Variables:');
console.log('--------------------------------------------');

requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (!value || value.trim() === '') {
    console.log(`❌ ${varName}: NOT SET`);
    hasErrors = true;
  } else {
    // Mask sensitive values
    const maskedValue = varName.includes('SECRET') || varName.includes('CLIENT_SECRET')
      ? 'SET (hidden)'
      : varName.includes('CLIENT_ID')
      ? `${value.substring(0, 8)}...`
      : value.length > 30
      ? `${value.substring(0, 30)}...`
      : value;
    console.log(`✅ ${varName}: ${maskedValue}`);
  }
});

console.log('\n2. ✅ Checking Configuration Files:');
console.log('-----------------------------------');

// Check Next.js config
const nextConfigPath = path.join(process.cwd(), 'next.config.mjs');
if (fs.existsSync(nextConfigPath)) {
  const nextConfig = fs.readFileSync(nextConfigPath, 'utf8');
  
  // Check for unoptimized images in production
  if (nextConfig.includes("unoptimized: process.env.NODE_ENV === 'production'")) {
    console.log('✅ Next.js images unoptimized for production: CONFIGURED');
  } else {
    console.log('❌ Next.js images unoptimized for production: NOT CONFIGURED');
    hasErrors = true;
  }
  
  // Check for removed experimental cache dir
  if (!nextConfig.includes('experimental') || !nextConfig.includes('cacheDir')) {
    console.log('✅ Invalid experimental.images.cacheDir: REMOVED');
  } else {
    console.log('❌ Invalid experimental.images.cacheDir: STILL PRESENT');
    hasErrors = true;
  }
} else {
  console.log('❌ next.config.mjs: NOT FOUND');
  hasErrors = true;
}

// Check Elastic Beanstalk configurations
const ebExtensionsDir = path.join(process.cwd(), '.ebextensions');
if (fs.existsSync(ebExtensionsDir)) {
  const configFiles = fs.readdirSync(ebExtensionsDir).filter(f => f.endsWith('.config'));
  console.log(`✅ Elastic Beanstalk configs found: ${configFiles.join(', ')}`);
  
  // Check for permissions config
  const permissionsConfig = path.join(ebExtensionsDir, '01_permissions.config');
  if (fs.existsSync(permissionsConfig)) {
    console.log('✅ Permissions config: EXISTS');
  } else {
    console.log('❌ Permissions config: MISSING');
    hasErrors = true;
  }
  
  // Check for nginx config
  const nginxConfig = path.join(ebExtensionsDir, '02_nginx.config');
  if (fs.existsSync(nginxConfig)) {
    console.log('✅ Nginx buffer config: EXISTS');
  } else {
    console.log('❌ Nginx buffer config: MISSING');
    hasErrors = true;
  }
} else {
  console.log('❌ .ebextensions directory: NOT FOUND');
  hasErrors = true;
}

console.log('\n3. ✅ Checking Route Configurations:');
console.log('-----------------------------------');

// Check Auth0 route
const auth0RoutePath = path.join(process.cwd(), 'src/app/api/auth/[auth0]/route.ts');
if (fs.existsSync(auth0RoutePath)) {
  const auth0Route = fs.readFileSync(auth0RoutePath, 'utf8');
  if (auth0Route.includes("dynamic = 'force-dynamic'")) {
    console.log('✅ Auth0 route dynamic config: SET');
  } else {
    console.log('❌ Auth0 route dynamic config: MISSING');
    hasErrors = true;
  }
} else {
  console.log('❌ Auth0 route: NOT FOUND');
  hasErrors = true;
}

console.log('\n4. ✅ Summary:');
console.log('-------------');

if (hasErrors) {
  console.log('❌ DEPLOYMENT NOT READY - Please fix the issues above');
  process.exit(1);
} else {
  console.log('✅ ALL CHECKS PASSED - Ready for deployment!');
  console.log('\nNext steps:');
  console.log('1. Deploy to Elastic Beanstalk');
  console.log('2. Test /api/debug-env endpoint in production');
  console.log('3. Test Auth0 login flow');
  console.log('4. Remove /api/debug-env endpoint after verification');
}
