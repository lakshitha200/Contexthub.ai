import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CollectionModule } from './collection/collection.module';
import { DocumentModule } from './document/document.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { JobModule } from './jobs/job.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    StorageModule,
    EmbeddingModule,
    JobModule,
    WorkspaceModule,
    CollectionModule,
    DocumentModule,
    IngestionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
