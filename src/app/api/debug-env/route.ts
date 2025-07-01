import { NextResponse } from 'next/server';

export async function GET() {
  // This endpoint helps debug environment variables in production
  // Remove this after debugging!
  
  const envVars = {
    NODE_ENV: process.env.NODE_ENV,
    AUTH0_BASE_URL: process.env.AUTH0_BASE_URL ? `${process.env.AUTH0_BASE_URL.substring(0, 20)}...` : 'NOT SET',
    AUTH0_ISSUER_BASE_URL: process.env.AUTH0_ISSUER_BASE_URL ? `${process.env.AUTH0_ISSUER_BASE_URL.substring(0, 20)}...` : 'NOT SET',
    AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID ? `${process.env.AUTH0_CLIENT_ID.substring(0, 8)}...` : 'NOT SET',
    AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET ? 'SET' : 'NOT SET',
    AUTH0_SECRET: process.env.AUTH0_SECRET ? 'SET' : 'NOT SET',
    AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE ? `${process.env.AUTH0_AUDIENCE.substring(0, 20)}...` : 'NOT SET',
  };

  return NextResponse.json({
    message: 'Environment Debug Info',
    timestamp: new Date().toISOString(),
    env: envVars,
    warning: 'DELETE THIS ENDPOINT AFTER DEBUGGING!'
  });
}
