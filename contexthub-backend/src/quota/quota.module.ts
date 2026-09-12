import { Global, Module } from '@nestjs/common';
import { QuotaController } from './quota.controller';
import { QuotaService } from './quota.service';

/**
 * Global because usage is metered wherever the provider is called: chat,
 * ingestion analysis and vision. Threading the module import through every one
 * of those would be noise for a service with a two-method surface.
 */
@Global()
@Module({
  controllers: [QuotaController],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
