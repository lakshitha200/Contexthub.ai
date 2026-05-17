import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceGuard } from '../workspace/guards/workspace.guard';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import type { UploadedFileLike } from './dto/uploaded-file';

describe('DocumentController', () => {
  let controller: DocumentController;

  const serviceMock: Partial<Record<keyof DocumentService, jest.Mock>> = {
    create: jest.fn(),
    list: jest.fn(),
    getById: jest.fn(),
    download: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentController],
      providers: [{ provide: DocumentService, useValue: serviceMock }],
    })
      .overrideGuard(WorkspaceGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DocumentController>(DocumentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('uploads a document scoped to the collection and uploader', async () => {
    const file = {
      originalname: 'spec.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('hi'),
    } satisfies UploadedFileLike;

    await controller.upload('ws-1', 'col-1', { id: 'user-1' }, file);

    expect(serviceMock.create).toHaveBeenCalledWith(
      'ws-1',
      'col-1',
      'user-1',
      file,
    );
  });

  it('lists documents with an optional status filter', async () => {
    await controller.list('ws-1', 'col-1', {});
    expect(serviceMock.list).toHaveBeenCalledWith('ws-1', 'col-1', undefined);
  });
});
