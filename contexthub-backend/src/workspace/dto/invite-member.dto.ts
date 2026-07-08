import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { Role } from '../../../generated/prisma/client';

export class InviteMemberDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsIn([Role.ADMIN, Role.MEMBER], {
    message: 'Role must be ADMIN or MEMBER',
  })
  role!: typeof Role.ADMIN | typeof Role.MEMBER;
}
