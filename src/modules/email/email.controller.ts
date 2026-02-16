import { Controller, Get, Post, Delete, Query, Body, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { EmailService, CapturedEmail } from './email.service';

@ApiTags('📧 Email Capture (Dev Only)')
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Public()
  @Get('inbox')
  @ApiOperation({ summary: 'View email inbox (HTML)' })
  @ApiQuery({ name: 'email', required: false, description: 'Filter by recipient' })
  async getInboxPage(
    @Query('email') email: string,
    @Res() res: Response,
  ) {
    const emails = email 
      ? this.emailService.getInbox(email)
      : this.emailService.getAllEmails();

    const html = this.renderInboxPage(email, emails);
    res.send(html);
  }

  @Public()
  @Get('api/inbox')
  @ApiOperation({ summary: 'Get emails as JSON' })
  getInboxApi(@Query('email') email?: string): CapturedEmail[] {
    if (email) {
      return this.emailService.getInbox(email);
    }
    return this.emailService.getAllEmails();
  }

  @Public()
  @Get('latest')
  @ApiOperation({ summary: 'Get latest email for address' })
  getLatest(@Query('email') email: string): CapturedEmail | { message: string } {
    const latest = this.emailService.getLatest(email);
    return latest || { message: 'No emails found' };
  }

  @Public()
  @Post('clear')
  @ApiOperation({ summary: 'Clear inbox' })
  clear(@Body('email') email?: string): { cleared: boolean; count: number } {
    const before = this.emailService.getAllEmails().length;
    this.emailService.clear(email);
    const after = this.emailService.getAllEmails().length;
    return { 
      cleared: true, 
      count: before - after 
    };
  }

  private renderInboxPage(filterEmail: string | undefined, emails: CapturedEmail[]): string {
    const emailCards = emails.map(email => `
      <div style="background: white; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; border-left: 4px solid ${email.metadata?.type === 'verification' ? '#007bff' : '#6c757d'};">
        <div style="background: #f8f9fa; padding: 15px 20px; border-bottom: 1px solid #e9ecef; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="color: #333;">${email.subject}</strong>
            ${email.metadata?.type ? `<span style="display: inline-block; margin-left: 10px; padding: 2px 8px; background: ${email.metadata.type === 'verification' ? '#007bff' : '#6c757d'}; color: white; border-radius: 4px; font-size: 12px;">${email.metadata.type}</span>` : ''}
          </div>
          <span style="color: #6c757d; font-size: 12px;">${email.sentAt.toLocaleString()}</span>
        </div>
        <div style="padding: 20px;">
          <div style="margin-bottom: 15px;">
            <strong>To:</strong> ${email.to}<br>
            <strong>From:</strong> ${email.from}<br>
            <strong>ID:</strong> <code>${email.id}</code>
          </div>
          ${email.metadata?.token ? `
            <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 4px; margin-bottom: 15px;">
              <strong>🔑 Token:</strong> <code style="word-break: break-all;">${email.metadata.token}</code><br>
              <strong>🔗 Direct Link:</strong> <a href="${email.metadata.verificationUrl}" target="_blank">${email.metadata.verificationUrl}</a>
            </div>
          ` : ''}
          <div style="border: 1px solid #dee2e6; border-radius: 4px; padding: 15px; background: white;">
            ${email.html}
          </div>
        </div>
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>📧 LifeOS Email Capture</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 900px; margin: 0 auto; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 20px; }
          .header h1 { margin: 0; font-size: 28px; }
          .header p { margin: 10px 0 0; opacity: 0.9; }
          .stats { display: flex; gap: 15px; margin-bottom: 20px; }
          .stat { background: white; padding: 15px 25px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .stat-value { font-size: 24px; font-weight: bold; color: #333; }
          .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
          .actions { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
          .btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; font-size: 14px; }
          .btn-primary { background: #007bff; color: white; }
          .btn-danger { background: #dc3545; color: white; }
          .btn-secondary { background: #6c757d; color: white; }
          .search-box { padding: 10px 15px; border: 1px solid #ddd; border-radius: 4px; width: 300px; font-size: 14px; }
          .empty { text-align: center; padding: 60px; color: #666; }
          .auto-refresh { position: fixed; bottom: 20px; right: 20px; background: #28a745; color: white; padding: 10px 20px; border-radius: 20px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📧 LifeOS Email Capture</h1>
            <p>Development email testing interface - All emails are captured locally, never sent</p>
          </div>
          
          <div class="stats">
            <div class="stat">
              <div class="stat-value">${emails.length}</div>
              <div class="stat-label">${filterEmail ? 'Emails for ' + filterEmail : 'Total Emails'}</div>
            </div>
            <div class="stat">
              <div class="stat-value">${new Set(emails.map(e => e.to)).size}</div>
              <div class="stat-label">Unique Recipients</div>
            </div>
          </div>

          <div class="actions">
            <form method="GET" style="display: flex; gap: 10px; flex: 1;">
              <input type="text" name="email" placeholder="Filter by email address..." value="${filterEmail || ''}" class="search-box">
              <button type="submit" class="btn btn-primary">Filter</button>
              ${filterEmail ? `<a href="?email=" class="btn btn-secondary">Clear Filter</a>` : ''}
            </form>
            <form method="POST" action="clear" onsubmit="return confirm('Clear all emails?');" style="display: inline;">
              <button type="submit" class="btn btn-danger">Clear All</button>
            </form>
            <a href="api/inbox" class="btn btn-secondary" target="_blank">View JSON</a>
          </div>

          ${emails.length > 0 ? emailCards : '<div class="empty"><h2>📭 No emails yet</h2><p>Register a user to see verification emails captured here</p></div>'}
        </div>

        <div class="auto-refresh">Auto-refresh: ON (10s)</div>

        <script>
          setTimeout(() => location.reload(), 10000);
        </script>
      </body>
      </html>
    `;
  }
}