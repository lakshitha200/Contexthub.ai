import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    // No key (e.g. local dev) → we just log the links instead of sending.
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  async sendVerificationEmail(email: string, token: string) {
    const url = `${this.webUrl()}/auth/verify-email?token=${token}`;
    await this.send(
      email,
      'Verify your email',
      `<p>Welcome to ContextHub! Confirm your email to activate your account.</p>
       <p><a href="${url}">Verify my email</a></p>
       <p>This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>`,
      `Verify your email: ${url}`,
    );
  }

  async sendPasswordReset(email: string, token: string) {
    const url = `${this.webUrl()}/auth/reset-password?token=${token}`;
    await this.send(
      email,
      'Reset your password',
      `<p>We received a request to reset your ContextHub password.</p>
       <p><a href="${url}">Choose a new password</a></p>
       <p>This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>`,
      `Reset your password: ${url}`,
    );
  }

  async sendWorkspaceInvite(email: string, workspaceName: string, token: string) {
    const url = `${this.webUrl()}/invite/accept?token=${token}`;
    await this.send(
      email,
      `You've been invited to "${workspaceName}"`,
      `<p>You've been invited to join the <strong>${workspaceName}</strong> workspace on ContextHub.</p>
       <p><a href="${url}">Accept invitation</a></p>`,
      `Accept your invite to "${workspaceName}": ${url}`,
    );
  }

  private async send(to: string, subject: string, html: string, logLine: string) {
    if (!this.resend) {
      this.logger.log(`[mail disabled] ${to} — ${logLine}`);
      return;
    }
    try {
      const { error } = await this.resend.emails.send({
        from: this.from(),
        to,
        subject,
        html,
      });
      if (error) {
        this.logger.error(`Failed to send "${subject}" to ${to}: ${error.message}`);
      }
    } catch (err) {
      this.logger.error(
        `Failed to send "${subject}" to ${to}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private from(): string {
    return this.config.get<string>('RESEND_FROM', 'onboarding@resend.dev');
  }

  private webUrl(): string {
    return this.config.get<string>('WEB_URL', 'http://localhost:3001');
  }
}
