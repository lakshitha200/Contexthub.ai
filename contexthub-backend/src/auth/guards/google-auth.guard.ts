import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  /**
   * Force Google to show the account chooser every time, instead of silently
   * reusing the currently signed-in Google session. Without this, signing out
   * of ContextHub (but not Google) skips the account-selection screen.
   */
  getAuthenticateOptions() {
    return { prompt: 'select_account' };
  }
}
