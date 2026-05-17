import { Test, TestingModule } from '@nestjs/testing';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';

describe('CollectionController', () => {
  let controller: CollectionController;

  const serviceMock: Partial<Record<keyof CollectionService, jest.Mock>> = {
    create: jest.fn(),
    list: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollectionController],
      providers: [{ provide: CollectionService, useValue: serviceMock }],
    })
      .overrideGuard(
        // WorkspaceGuard is wired in the real module; bypass it in unit tests.
        require('../workspace/guards/workspace.guard').WorkspaceGuard,
      )
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CollectionController>(CollectionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a collection scoped to the workspace', async () => {
    const dto = { name: 'Handbooks' };
    await controller.create('ws-1', dto);
    expect(serviceMock.create).toHaveBeenCalledWith('ws-1', dto);
  });

  it('lists collections for a workspace', async () => {
    await controller.list('ws-1');
    expect(serviceMock.list).toHaveBeenCalledWith('ws-1');
  });
});
