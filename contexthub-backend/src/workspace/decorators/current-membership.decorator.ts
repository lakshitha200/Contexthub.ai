import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Role } from '../../../generated/prisma/client';

export interface ActiveMembership {
  membershipId: string;
  workspaceId: string;
  userId: string;
  role: Role;
}

export const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActiveMembership => {
    const request = ctx.switchToHttp().getRequest();
    return request.membership as ActiveMembership;
  },
);
