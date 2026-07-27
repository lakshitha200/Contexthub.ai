import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

type MailDriver = 'smtp' | 'resend' | 'none';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly driver: MailDriver;
  private readonly smtp: nodemailer.Transporter | null = null;
  private readonly resend: Resend | null = null;

  constructor(private readonly config: ConfigService) {
    // Priority: SMTP (if configured) → Resend (if configured) → log-only.
    const smtpHost = this.config.get<string>('SMTP_HOST');
    const resendKey = this.config.get<string>('RESEND_API_KEY');

    if (smtpHost) {
      const port = Number(this.config.get<string>('SMTP_PORT', '587'));
      this.smtp = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
        // Dev only: skip cert verification when a local proxy/AV/firewall
        // presents a self-signed cert. NEVER enable this in production.
        ...(process.env.NODE_ENV !== 'production'
          ? { tls: { rejectUnauthorized: false } }
          : {}),
      });
      this.driver = 'smtp';
    } else if (resendKey) {
      this.resend = new Resend(resendKey);
      this.driver = 'resend';
    } else {
      // No provider (e.g. local dev) → we just log the links instead of sending.
      this.driver = 'none';
    }
    this.logger.log(`Mail driver: ${this.driver}`);
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
    try {
      if (this.driver === 'smtp' && this.smtp) {
        await this.smtp.sendMail({ from: this.from(), to, subject, html });
        return;
      }
      if (this.driver === 'resend' && this.resend) {
        const { error } = await this.resend.emails.send({
          from: this.from(),
          to,
          subject,
          html,
        });
        if (error) {
          this.logger.error(`Failed to send "${subject}" to ${to}: ${error.message}`);
        }
        return;
      }
      this.logger.log(`[mail disabled] ${to} — ${logLine}`);
    } catch (err) {
      this.logger.error(
        `Failed to send "${subject}" to ${to}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private from(): string {
    // SMTP uses SMTP_FROM; Resend uses RESEND_FROM. Fall back sensibly.
    if (this.driver === 'smtp') {
      return this.config.get<string>(
        'SMTP_FROM',
        this.config.get<string>('SMTP_USER', 'no-reply@localhost'),
      );
    }
    return this.config.get<string>('RESEND_FROM', 'onboarding@resend.dev');
  }

  private webUrl(): string {
    return this.config.get<string>('WEB_URL', 'http://localhost:3001');
  }
}
