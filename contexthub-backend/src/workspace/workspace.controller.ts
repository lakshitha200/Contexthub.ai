import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../../generated/prisma/client';
import { CurrentMembership } from './decorators/current-membership.decorator';
import type { ActiveMembership } from './decorators/current-membership.decorator';
import { Roles } from './decorators/roles.decorator';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceGuard } from './guards/workspace.guard';
import { WorkspaceService } from './workspace.service';

@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaces: WorkspaceService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspaces.create(user.id, dto);
  }

  @Get()
  listMine(@CurrentUser() user: { id: string }) {
    return this.workspaces.listMine(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('invites/accept')
  acceptInvite(
    @CurrentUser() user: { id: string; email: string },
    @Body() dto: AcceptInviteDto,
  ) {
    return this.workspaces.acceptInvite(user.id, user.email, dto.token);
  }

  @UseGuards(WorkspaceGuard)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.workspaces.getById(id);
  }

  @UseGuards(WorkspaceGuard)
  @Roles(Role.OWNER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkspaceDto) {
    return this.workspaces.update(id, dto);
  }

  @UseGuards(WorkspaceGuard)
  @Roles(Role.OWNER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workspaces.remove(id);
  }

  @UseGuards(WorkspaceGuard)
  @Get(':id/members')
  listMembers(@Param('id') id: string) {
    return this.workspaces.listMembers(id);
  }

  @UseGuards(WorkspaceGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':id/invite')
  invite(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: InviteMemberDto,
  ) {
    return this.workspaces.invite(id, user.id, dto);
  }

  @UseGuards(WorkspaceGuard)
  @Roles(Role.OWNER)
  @Patch(':id/members/:userId')
  updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.workspaces.updateMemberRole(id, userId, dto);
  }

  @UseGuards(WorkspaceGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Delete(':id/members/:userId')
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentMembership() membership: ActiveMembership,
  ) {
    return this.workspaces.removeMember(id, userId, membership);
  }

  @UseGuards(WorkspaceGuard)
  @HttpCode(HttpStatus.OK)
  @Post(':id/leave')
  leave(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.workspaces.leave(id, user.id);
  }
}
