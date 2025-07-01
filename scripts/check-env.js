#!/usr/bin/env node

/**
 * Environment Variable Checker
 * 
 * This script helps diagnose Auth0 configuration issues by checking
 * all required environment variables in different environments.
 */

const requiredAuth0Vars = [
  'AUTH0_SECRET',
  'AUTH0_BASE_URL',
  'AUTH0_ISSUER_BASE_URL', 
  'AUTH0_CLIENT_ID',
  'AUTH0_CLIENT_SECRET',
  'AUTH0_AUDIENCE'
];

const optionalVars = [
  'NEXT_PUBLIC_API_URL',
  'MONGODB_CONNECTION_STRING',
  'REDIS_URL'
];

console.log('🔍 Environment Variable Checker');
console.log('================================');
console.log(`Node Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Platform: ${process.platform}`);
console.log('');

console.log('✅ Required Auth0 Variables:');
console.log('-----------------------------');

let allPresent = true;
let warnings = [];

requiredAuth0Vars.forEach(varName => {
  const value = process.env[varName];
  const isPresent = !!value;
  const display = isPresent ? '✓' : '✗';
  
  if (!isPresent) {
    allPresent = false;
  }
  
  // Mask sensitive values for display
  let displayValue = 'NOT SET';
  if (isPresent) {
    if (varName.includes('SECRET') || varName.includes('CLIENT_SECRET')) {
      displayValue = `${value.substring(0, 8)}...`;
    } else if (varName === 'AUTH0_BASE_URL') {
      displayValue = value;
      // Check for common issues
      if (value === 'http://localhost:3000' && process.env.NODE_ENV === 'production') {
        warnings.push(`⚠️  AUTH0_BASE_URL is set to localhost in production environment`);
      }
    } else {
      displayValue = value;
    }
  }
  
  console.log(`${display} ${varName}: ${displayValue}`);
});

console.log('');
console.log('ℹ️  Optional Variables:');
console.log('----------------------');

optionalVars.forEach(varName => {
  const value = process.env[varName];
  const isPresent = !!value;
  const display = isPresent ? '✓' : '○';
  
  let displayValue = isPresent ? 
    (varName.includes('CONNECTION_STRING') ? `${value.substring(0, 20)}...` : value) : 
    'NOT SET';
    
  console.log(`${display} ${varName}: ${displayValue}`);
});

console.log('');
console.log('🏥 Health Check Simulation:');
console.log('---------------------------');

// Simulate the health check logic
const healthResults = {
  auth: requiredAuth0Vars.every(varName => !!process.env[varName]),
  database: !!process.env.MONGODB_CONNECTION_STRING,
  cache: !!process.env.REDIS_URL || (!!process.env.REDIS_HOST && !!process.env.REDIS_PORT)
};

Object.entries(healthResults).forEach(([service, healthy]) => {
  console.log(`${healthy ? '✓' : '✗'} ${service}: ${healthy ? 'healthy' : 'unhealthy'}`);
});

console.log('');

if (!allPresent) {
  console.log('🚨 Issues Found:');
  console.log('----------------');
  console.log('• Missing required Auth0 environment variables');
  console.log('• This will cause "baseURL is required" errors');
  console.log('• Health check will show "auth unhealthy"');
  console.log('');
}

if (warnings.length > 0) {
  console.log('⚠️  Warnings:');
  console.log('-------------');
  warnings.forEach(warning => console.log(warning));
  console.log('');
}

if (allPresent && warnings.length === 0) {
  console.log('✅ All Auth0 environment variables are properly configured!');
} else {
  console.log('💡 Next Steps:');
  console.log('-------------');
  
  if (!allPresent) {
    console.log('1. Set all missing Auth0 environment variables in your deployment platform');
  }
  
  if (warnings.length > 0) {
    console.log('2. Update AUTH0_BASE_URL to match your production domain');
    console.log('   Example: https://your-app.your-domain.com');
  }
  
  console.log('3. Restart your application after setting environment variables');
  console.log('4. Check the health endpoint: GET /api/health');
}

console.log('');
process.exit(allPresent && warnings.length === 0 ? 0 : 1);
