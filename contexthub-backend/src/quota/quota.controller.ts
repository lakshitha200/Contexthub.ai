import { Controller, Get } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { QuotaService, type QuotaSummary } from './quota.service';

/**
 * Lets the UI show an allowance before the user runs into it.
 *
 * A limit you only discover by hitting it feels arbitrary; a meter that has
 * been creeping up all session explains itself.
 */
@Controller('usage')
export class QuotaController {
  constructor(private readonly quota: QuotaService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<QuotaSummary> {
    return this.quota.summary(user.id);
  }
}
