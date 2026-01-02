// lib/services/email-service.ts
// Email service using AWS SES (Simple Email Service)
// Uses AWS SDK v3 with default credential provider chain
// Credentials are read from environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { env } from '@/lib/config/env';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

class EmailService {
  private sesClient: SESClient | null = null;
  private defaultFromEmail: string;
  private region: string;

  constructor() {
    // Get AWS region from environment config (defaults to us-east-2 per project documentation)
    // AWS SDK v3 default credential provider chain automatically checks:
    // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    // 2. Shared credentials file (~/.aws/credentials)
    // 3. IAM instance profile (when running on EC2/EB)
    this.region = env.ses.region;
    
    // Initialize SES client - credentials are automatically loaded from environment
    this.sesClient = new SESClient({ region: this.region });

    // Get default from email from environment config
    // Must be verified in AWS SES before sending emails
    this.defaultFromEmail = env.ses.fromEmail;
  }

  /**
   * Send email using AWS SES
   * Credentials are automatically retrieved from environment variables via AWS SDK default provider chain
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    const { to, subject, html, text, from } = options;
    const fromEmail = from || this.defaultFromEmail;

    // In development, log the email instead of sending (unless explicitly enabled)
    // Per project documentation: emails are only sent when NODE_ENV is 'production' or 'staging'
    if (process.env.NODE_ENV === 'development' && process.env.SES_SEND_IN_DEV !== 'true') {
      console.log('📧 Email (dev mode - not sent):', {
        from: fromEmail,
        to,
        subject,
        text: text || html.substring(0, 200) + '...',
      });
      console.log('💡 To actually send emails in development, set SES_SEND_IN_DEV=true');
      console.log('💡 Per project docs: emails are only sent when NODE_ENV is "production" or "staging"');
      return;
    }

    if (!this.sesClient) {
      throw new Error('SES client not initialized');
    }

    try {
      // Prepare email parameters for SES
      const params = {
        Source: fromEmail,
        Destination: {
          ToAddresses: [to],
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: html,
              Charset: 'UTF-8',
            },
            ...(text && {
              Text: {
                Data: text,
                Charset: 'UTF-8',
              },
            }),
          },
        },
      };

      // Send email via AWS SES
      const command = new SendEmailCommand(params);
      const response = await this.sesClient.send(command);

      console.log('✅ Email sent successfully:', {
        messageId: response.MessageId,
        to,
        subject,
      });

      return;
    } catch (error) {
      console.error('❌ Failed to send email via AWS SES:', error);
      
      // Check for specific error types
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorObj = error as { Code?: string; Error?: { Code?: string } };
      const errorCode = errorObj?.Code || errorObj?.Error?.Code;
      
      // Handle email verification errors gracefully
      if (
        errorMessage.includes('Email address is not verified') ||
        errorMessage.includes('Email address not verified') ||
        errorCode === 'MessageRejected'
      ) {
        const helpfulMessage = `Email address "${fromEmail}" is not verified in AWS SES (region: ${this.region}). 
        
To fix this:
1. Go to AWS SES Console: https://console.aws.amazon.com/ses/
2. Navigate to "Verified identities" in the region: ${this.region}
3. Click "Create identity" and verify the email: ${fromEmail}
4. Or set SES_FROM_EMAIL to an already verified email address in your .env file
5. Restart your application after updating .env

For development, the OTP code will be logged to console instead.`;

        console.warn('⚠️', helpfulMessage);
        
        // In development, don't throw - just log the helpful message
        if (process.env.NODE_ENV === 'development') {
          console.log('💡 In development mode, email sending is skipped when SES email is not verified.');
          return; // Silently fail in dev mode
        }
        
        // In production, throw with helpful message
        throw new Error(helpfulMessage);
      }
      
      // Handle credential errors
      if (errorMessage.includes('Credentials') || errorMessage.includes('credentials')) {
        throw new Error(
          'AWS credentials not found. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.'
        );
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Send OTP code via email
   */
  async sendOTPCode(email: string, code: string): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Your Login Code</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px;">Hello,</p>
            <p style="font-size: 16px;">Your one-time login code is:</p>
            <div style="background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <h2 style="color: #667eea; font-size: 32px; letter-spacing: 8px; margin: 0;">${code}</h2>
            </div>
            <p style="font-size: 14px; color: #666;">This code will expire in 10 minutes.</p>
            <p style="font-size: 14px; color: #666;">If you didn't request this code, please ignore this email.</p>
          </div>
        </body>
      </html>
    `;

    const text = `Your login code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`;

    await this.sendEmail({
      to: email,
      subject: 'Your Login Code',
      html,
      text,
    });
  }
}

export const emailService = new EmailService();
export default emailService;

