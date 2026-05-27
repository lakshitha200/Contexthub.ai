import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { Prisma, Role } from '../../generated/prisma/client';
import { MailService } from '../auth/services/mail.service';
import { TokenService } from '../auth/services/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActiveMembership } from './decorators/current-membership.decorator';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto) {
    const base = this.slugify(dto.name);

    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
      try {
        return await this.prisma.workspace.create({
          data: {
            name: dto.name,
            slug,
            description: dto.description ?? null,
            members: {
              create: { userId, role: Role.OWNER },
            },
          },
          include: {
            members: { where: { userId }, select: { role: true } },
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          (err.meta?.target as string[] | undefined)?.includes('slug')
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new ConflictException('Could not allocate a unique workspace slug');
  }

  async listMine(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
      select: {
        role: true,
        workspace: {
          include: { _count: { select: { members: true, documents: true } } },
        },
      },
    });

    return memberships.map((m) => ({ ...m.workspace, role: m.role }));
  }

  async getById(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { _count: { select: { members: true, documents: true, collections: true } } },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  async update(workspaceId: string, dto: UpdateWorkspaceDto) {
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { name: dto.name, description: dto.description },
    });
  }

  async remove(workspaceId: string) {
    await this.prisma.workspace.delete({ where: { id: workspaceId } });
    return { success: true };
  }

  async listMembers(workspaceId: string) {
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: { joinedAt: 'asc' },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        user: {
          select: { id: true, email: true, name: true, avatarUrl: true },
        },
      },
    });
  }

  async invite(
    workspaceId: string,
    inviterId: string,
    dto: InviteMemberDto,
  ) {
    const email = dto.email.trim().toLowerCase();

    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { name: true },
    });

    const existingMember = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, user: { email } },
    });
    if (existingMember) {
      throw new ConflictException('User is already a member of this workspace');
    }

    const rawToken = this.tokens.generateOpaqueToken();
    const tokenHash = this.tokens.hash(rawToken);
    const expiresAt = new Date(Date.now() + this.inviteTtlMs());

    await this.prisma.invite.upsert({
      where: { workspaceId_email: { workspaceId, email } },
      create: {
        workspaceId,
        email,
        role: dto.role,
        tokenHash,
        invitedById: inviterId,
        expiresAt,
      },
      update: {
        role: dto.role,
        tokenHash,
        invitedById: inviterId,
        expiresAt,
        acceptedAt: null,
        revokedAt: null,
      },
    });

    await this.mail.sendWorkspaceInvite(email, workspace.name, rawToken);
    return { success: true };
  }

  async acceptInvite(userId: string, userEmail: string, rawToken: string) {
    const tokenHash = this.tokens.hash(rawToken);

    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({ where: { tokenHash } });

      if (
        !invite ||
        invite.acceptedAt ||
        invite.revokedAt ||
        invite.expiresAt < new Date()
      ) {
        throw new BadRequestException('Invalid or expired invite');
      }
      if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
        throw new ForbiddenException('This invite was issued for a different email');
      }

      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      try {
        return await tx.workspaceMember.create({
          data: { userId, workspaceId: invite.workspaceId, role: invite.role },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictException('You are already a member of this workspace');
        }
        throw err;
      }
    });
  }

  async updateMemberRole(
    workspaceId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const target = await this.getMembershipOrThrow(workspaceId, targetUserId);

    if (target.role === Role.OWNER && dto.role !== Role.OWNER) {
      await this.assertNotLastOwner(workspaceId);
    }

    return this.prisma.workspaceMember.update({
      where: { id: target.id },
      data: { role: dto.role },
      select: { id: true, role: true, userId: true },
    });
  }

  async removeMember(
    workspaceId: string,
    targetUserId: string,
    acting: ActiveMembership,
  ) {
    const target = await this.getMembershipOrThrow(workspaceId, targetUserId);

    if (target.userId === acting.userId) {
      throw new BadRequestException('Use "leave workspace" to remove yourself');
    }
    if (target.role === Role.OWNER && acting.role !== Role.OWNER) {
      throw new ForbiddenException('Only an owner can remove another owner');
    }
    if (target.role === Role.OWNER) {
      await this.assertNotLastOwner(workspaceId);
    }

    await this.prisma.workspaceMember.delete({ where: { id: target.id } });
    return { success: true };
  }

  async leave(workspaceId: string, userId: string) {
    const membership = await this.getMembershipOrThrow(workspaceId, userId);
    if (membership.role === Role.OWNER) {
      await this.assertNotLastOwner(workspaceId);
    }
    await this.prisma.workspaceMember.delete({ where: { id: membership.id } });
    return { success: true };
  }

  private async getMembershipOrThrow(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!membership) throw new NotFoundException('Member not found in this workspace');
    return membership;
  }

  private async assertNotLastOwner(workspaceId: string) {
    const owners = await this.prisma.workspaceMember.count({
      where: { workspaceId, role: Role.OWNER },
    });
    if (owners <= 1) {
      throw new BadRequestException(
        'Workspace must keep at least one owner — promote someone else first',
      );
    }
  }

  private slugify(name: string): string {
    return (
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'workspace'
    );
  }

  private inviteTtlMs(): number {
    const days = Number(this.config.get<string>('INVITE_TTL_DAYS', '7'));
    return days * 24 * 60 * 60 * 1000;
  }
}
