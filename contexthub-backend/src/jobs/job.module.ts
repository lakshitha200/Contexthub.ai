import { Global, Module } from '@nestjs/common';
import { JobSignal } from './job-signal';
import { JobService } from './job.service';

@Global()
@Module({
  providers: [JobService, JobSignal],
  exports: [JobService, JobSignal],
})
export class JobModule {}
