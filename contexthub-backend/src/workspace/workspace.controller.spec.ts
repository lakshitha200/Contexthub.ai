import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceController', () => {
  let controller: WorkspaceController;

  const serviceMock: Partial<Record<keyof WorkspaceService, jest.Mock>> = {
    create: jest.fn(),
    listMine: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    listMembers: jest.fn(),
    invite: jest.fn(),
    acceptInvite: jest.fn(),
    updateMemberRole: jest.fn(),
    removeMember: jest.fn(),
    leave: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkspaceController],
      providers: [{ provide: WorkspaceService, useValue: serviceMock }],
    }).compile();

    controller = module.get<WorkspaceController>(WorkspaceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a workspace for the current user', async () => {
    const dto = { name: 'Acme' };
    await controller.create({ id: 'user-1' }, dto);
    expect(serviceMock.create).toHaveBeenCalledWith('user-1', dto);
  });
});
