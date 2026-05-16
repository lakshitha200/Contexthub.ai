import { IsIn } from 'class-validator';
import { Role } from '../../../generated/prisma/client';

export class UpdateMemberRoleDto {
  @IsIn([Role.OWNER, Role.ADMIN, Role.MEMBER], {
    message: 'Role must be OWNER, ADMIN or MEMBER',
  })
  role!: Role;
}
