import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { GoogleProfile } from './strategies/google.strategy';
import { JwtRefreshPayload } from './strategies/jwt-refresh.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, this.meta(req));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: Request) {
    return this.auth.verifyEmail(dto, this.meta(req));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email/resend')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto);
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Req() req: Request & { user: JwtRefreshPayload & { refreshToken: string } }) {
    return this.tokens.rotate(req.user, req.user.refreshToken, this.meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Body('refreshToken') refreshToken: string) {
    return this.auth.logout(refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: { id: string }) {
    return this.auth.me(user.id);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestPasswordReset(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto, this.meta(req));
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  googleStart() {}

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const webUrl = this.config.get<string>('WEB_URL', 'http://localhost:3001');
    try {
      const profile = req.user as GoogleProfile;
      const result = await this.auth.loginOrCreateOAuth(profile, 'google', this.meta(req));
      const params = new URLSearchParams({
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      });
      res.redirect(`${webUrl}/auth/callback?${params.toString()}`);
    } catch (err) {
      // e.g. the email already belongs to an email+password account. Bounce back
      // to the login page with a readable message instead of a raw JSON error.
      const message =
        err instanceof Error ? err.message : 'Could not sign in with Google.';
      res.redirect(`${webUrl}/auth/login?error=${encodeURIComponent(message)}`);
    }
  }

  private meta(req: Request) {
    return {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
  }
}
