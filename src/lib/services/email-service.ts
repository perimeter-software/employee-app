// lib/services/email-service.ts
// Email service using AWS SES (Simple Email Service)
// Uses AWS SDK v3 with default credential provider chain.
// Replicates sp1-api + stadium-people email flow: same MIME structure and SendRawEmail for attachments.

import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { env } from '@/lib/config/env';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

/** In-memory attachment (replicates sp1-api queue attachment shape; we use content instead of path). */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

/** Options for sending email with attachments (same conceptual flow as sp1-api sendmessage + queue). */
export interface SendEmailWithAttachmentsOptions {
  from: string;
  fromDisplayName?: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  attachments: EmailAttachment[];
}

class EmailService {
  private sesClient: SESClient | null = null;
  private defaultFromEmail: string;
  private region: string;

  constructor() {
    // Get AWS region from environment config (defaults to us-east-2 per project documentation)
    this.region = env.ses.region;

    // Prefer explicit env credentials so SES works in Next.js server/bundled context
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const credentials =
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined;

    this.sesClient = new SESClient({
      region: this.region,
      ...(credentials && { credentials }),
    });

    // Get default from email from environment config (must be verified in AWS SES)
    this.defaultFromEmail = env.ses.fromEmail;
  }

  /** MIME type by extension (matches sp1-api queue/index.js attachment handling). */
  private static getMimeType(filename: string): string {
    const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : '';
    switch (ext) {
      case 'pdf':
        return 'application/pdf';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Build raw MIME message (same structure as sp1-api queue/index.js constructMimeMessage).
   * Uses multipart/mixed with boundary, HTML part, then one part per attachment (base64).
   */
  private buildRawMimeMessage(options: SendEmailWithAttachmentsOptions): Buffer {
    const toList = Array.isArray(options.to) ? options.to : [options.to];
    const toLine = toList.join(', ');
    const fromDisplay = options.fromDisplayName
      ? `${options.fromDisplayName} <${options.from}>`
      : options.from;
    const boundary = `----=_Part_${Date.now()}`;
    const lines: string[] = [
      `From: ${fromDisplay}`,
      `To: ${toLine}`,
      ...(options.cc?.length ? [`Cc: ${options.cc.join(', ')}`] : []),
      ...(options.bcc?.length ? [`Bcc: ${options.bcc.join(', ')}`] : []),
      `Subject: ${options.subject}`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      'MIME-Version: 1.0',
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      '',
      options.html,
      ...options.attachments.flatMap((att) => {
        const mimeType = EmailService.getMimeType(att.filename);
        const base64 = att.content.toString('base64');
        return [
          `--${boundary}`,
          `Content-Type: ${mimeType}; name="${att.filename}"`,
          `Content-Disposition: attachment; filename="${att.filename}"`,
          'Content-Transfer-Encoding: base64',
          '',
          base64,
        ];
      }),
      `--${boundary}--`,
    ];
    return Buffer.from(lines.join('\r\n'), 'utf-8');
  }

  /**
   * Send email with attachments using raw MIME (replicates sp1-api sendmessage + queue flow).
   * Same MIME shape as queue/index.js constructMimeMessage; attachments are in-memory (no disk paths).
   */
  async sendEmailWithAttachments(options: SendEmailWithAttachmentsOptions): Promise<void> {
    if (process.env.NODE_ENV === 'development' && process.env.SES_SEND_IN_DEV !== 'true') {
      console.log('📧 Email with attachments (dev mode - not sent):', {
        from: options.from,
        to: options.to,
        subject: options.subject,
        attachmentCount: options.attachments.length,
      });
      console.log('💡 To actually send in development, set SES_SEND_IN_DEV=true');
      return;
    }

    if (!this.sesClient) {
      throw new Error('SES client not initialized');
    }

    try {
      const raw = this.buildRawMimeMessage(options);
      const command = new SendRawEmailCommand({ RawMessage: { Data: raw } });
      const response = await this.sesClient.send(command);
      console.log('✅ Email with attachments sent:', {
        messageId: response.MessageId,
        to: options.to,
        subject: options.subject,
      });
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (msg.includes('Credentials') || msg.includes('credentials') || msg.includes('Could not load credentials')) {
        throw new Error(
          'AWS credentials not configured. Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to your .env (and optionally AWS_REGION).'
        );
      }
      throw err;
    }
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
      // Format sender with display name for system accounts
      // AWS SES supports format: "Display Name <email@address.com>"
      let formattedSource = fromEmail;
      const normalizedFromEmail = fromEmail.toLowerCase();
      if (normalizedFromEmail === 'job@stadiumpeople.com' || normalizedFromEmail === 'jobs@stadiumpeople.com') {
        // Use the original email case but with display name
        formattedSource = `Employee App <${fromEmail}>`;
        console.log(`📧 Using display name "Employee App" for email: ${fromEmail}`);
      }

      // Prepare email parameters for SES
      const params = {
        Source: formattedSource,
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

