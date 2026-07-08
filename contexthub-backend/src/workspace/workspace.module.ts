import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceGuard } from './guards/workspace.guard';
import { WorkspaceService } from './workspace.service';

@Module({
  imports: [AuthModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceGuard],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
