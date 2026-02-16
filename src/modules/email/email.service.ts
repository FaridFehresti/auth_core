import { Injectable, Logger } from '@nestjs/common';

export interface CapturedEmail {
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  sentAt: Date;
  metadata: Record<string, any>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly inbox: Map<string, CapturedEmail[]> = new Map();

  async captureEmail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
    metadata?: Record<string, any>;
  }): Promise<CapturedEmail> {
    const email: CapturedEmail = {
      id: this.generateId(),
      to: options.to.toLowerCase().trim(),
      subject: options.subject,
      html: options.html,
      text: options.text || this.stripHtml(options.html),
      from: options.from || 'noreply@lifeos.local',
      sentAt: new Date(),
      metadata: options.metadata || {},
    };

    const userInbox = this.inbox.get(email.to) || [];
    userInbox.unshift(email);
    this.inbox.set(email.to, userInbox);

    this.logger.log(`📧 Captured: ${email.subject} → ${email.to}`);
    
    // Also log to console for easy access during development
    console.log('\n📧 EMAIL CAPTURED');
    console.log('═══════════════════════════════════════');
    console.log(`To: ${email.to}`);
    console.log(`Subject: ${email.subject}`);
    console.log(`From: ${email.from}`);
    console.log(`ID: ${email.id}`);
    if (email.metadata.token) {
      console.log(`Token: ${email.metadata.token}`);
      console.log(`Link: http://localhost:3000/api/v1/auth/verify-email?token=${email.metadata.token}`);
    }
    console.log('═══════════════════════════════════════\n');

    return email;
  }

  // Specific method for verification emails
  async sendVerificationEmail(email: string, token: string): Promise<CapturedEmail> {
    const verificationUrl = `http://localhost:3000/api/v1/auth/verify-email?token=${token}`;

    return this.captureEmail({
      to: email,
      subject: 'Verify Your Email - LifeOS',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Welcome to LifeOS!</h2>
          <p>Please verify your email address by clicking the button below:</p>
          <a href="${verificationUrl}" 
             style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">
            Verify Email
          </a>
          <p style="margin-top: 20px;">Or copy this link:</p>
          <code style="background: #f4f4f4; padding: 8px; display: block; word-break: break-all;">${verificationUrl}</code>
          <p style="color: #666; font-size: 12px; margin-top: 20px;">This link expires in 24 hours.</p>
        </div>
      `,
      metadata: { 
        type: 'verification',
        token,
        verificationUrl 
      },
    });
  }

  // Get emails for an address
  getInbox(email: string): CapturedEmail[] {
    return this.inbox.get(email.toLowerCase().trim()) || [];
  }

  // Get all emails
  getAllEmails(): CapturedEmail[] {
    return Array.from(this.inbox.values()).flat();
  }

  // Get latest email for an address
  getLatest(email: string): CapturedEmail | null {
    const inbox = this.getInbox(email);
    return inbox[0] || null;
  }

  // Extract token from latest verification email
  getVerificationToken(email: string): string | null {
    const latest = this.getLatest(email);
    if (!latest) return null;
    return latest.metadata?.token || null;
  }

  // Clear inbox for testing
  clear(email?: string): void {
    if (email) {
      this.inbox.delete(email.toLowerCase());
      this.logger.log(`Cleared inbox for ${email}`);
    } else {
      this.inbox.clear();
      this.logger.log('Cleared all inboxes');
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}