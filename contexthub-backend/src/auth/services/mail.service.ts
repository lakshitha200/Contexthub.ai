import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendMagicLink(email: string, token: string) {
    const url = `${this.appUrl()}/auth/magic-link/verify?token=${token}`;
    this.logger.log(`Magic link for ${email}: ${url}`);
    // TODO: replace with Resend / SendGrid / Nodemailer
  }

  async sendVerificationEmail(email: string, token: string) {
    const url = `${this.appUrl()}/auth/verify-email?token=${token}`;
    this.logger.log(`Email verification for ${email}: ${url}`);
  }

  async sendPasswordReset(email: string, token: string) {
    const url = `${this.appUrl()}/auth/reset-password?token=${token}`;
    this.logger.log(`Password reset for ${email}: ${url}`);
  }

  private appUrl(): string {
    return this.config.get<string>('APP_URL', 'http://localhost:3000');
  }
}
