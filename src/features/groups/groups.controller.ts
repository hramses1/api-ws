import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { GroupOps } from 'src/infrastructure/whatsapp/group.ops';
import {
  CreateGroupDto,
  GroupPictureDto,
  GroupSettingsDto,
  JoinGroupDto,
  MembershipRequestActionDto,
  ParticipantsDto,
  UpdateGroupDto,
} from './groups.dto';
import {
  CreateGroupResponse,
  GroupDetailResponse,
  GroupInviteResponse,
  GroupOkResponse,
  GroupSummaryResponse,
  JoinGroupResponse,
  MembershipRequestResponse,
  ParticipantActionResponse,
} from './groups.response';

const GROUP_ID_PARAM = {
  name: 'id',
  description: 'Group chat id (…@g.us). URL-encode it.',
  example: '120363000000000000@g.us',
};

@ApiTags('Groups')
@ApiSecurity('api-key')
@Controller('whatsapp/groups')
export class GroupsController {
  constructor(private readonly groups: GroupOps) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a group' })
  @ApiResponse({ status: 201, type: CreateGroupResponse })
  create(@Body() dto: CreateGroupDto): Promise<CreateGroupResponse> {
    return this.groups.create(dto.title, dto.participants);
  }

  @Get()
  @ApiOperation({ summary: 'List the groups you belong to' })
  @ApiResponse({ status: 200, type: [GroupSummaryResponse] })
  list(): Promise<GroupSummaryResponse[]> {
    return this.groups.list();
  }

  // Declared before the :id routes so the literal path is not swallowed by it.
  @Post('join')
  @HttpCode(200)
  @ApiOperation({ summary: 'Join a group with an invite code' })
  @ApiResponse({ status: 200, type: JoinGroupResponse })
  join(@Body() dto: JoinGroupDto): Promise<JoinGroupResponse> {
    return this.groups.join(dto.inviteCode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Group detail, including participants' })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: GroupDetailResponse })
  detail(@Param('id') id: string): Promise<GroupDetailResponse> {
    return this.groups.detail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change the group subject and/or description' })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: GroupOkResponse })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ): Promise<GroupOkResponse> {
    await this.groups.update(id, dto);
    return { ok: true };
  }

  @Post(':id/participants')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Add participants',
    description:
      'Returns one result per participant: someone who restricts group adds fails individually without failing the request.',
  })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: [ParticipantActionResponse] })
  addParticipants(
    @Param('id') id: string,
    @Body() dto: ParticipantsDto,
  ): Promise<ParticipantActionResponse[]> {
    return this.groups.addParticipants(id, dto.participants);
  }

  @Delete(':id/participants')
  @ApiOperation({ summary: 'Remove participants' })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: GroupOkResponse })
  async removeParticipants(
    @Param('id') id: string,
    @Body() dto: ParticipantsDto,
  ): Promise<GroupOkResponse> {
    await this.groups.removeParticipants(id, dto.participants);
    return { ok: true };
  }

  @Post(':id/participants/promote')
  @HttpCode(200)
  @ApiOperation({ summary: 'Promote participants to admin' })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: GroupOkResponse })
  async promote(
    @Param('id') id: string,
    @Body() dto: ParticipantsDto,
  ): Promise<GroupOkResponse> {
    await this.groups.promoteParticipants(id, dto.participants);
    return { ok: true };
  }

  @Post(':id/participants/demote')
  @HttpCode(200)
  @ApiOperation({ summary: 'Demote admins to regular members' })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: GroupOkResponse })
  async demote(
    @Param('id') id: string,
    @Body() dto: ParticipantsDto,
  ): Promise<GroupOkResponse> {
    await this.groups.demoteParticipants(id, dto.participants);
    return { ok: true };
  }

  @Patch(':id/settings')
  @ApiOperation({
    summary: 'Change who can post, edit the info or add members',
  })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: GroupOkResponse })
  async settings(
    @Param('id') id: string,
    @Body() dto: GroupSettingsDto,
  ): Promise<GroupOkResponse> {
    await this.groups.updateSettings(id, dto);
    return { ok: true };
  }

  @Get(':id/invite')
  @ApiOperation({ summary: 'Get the invite code and link' })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: GroupInviteResponse })
  invite(@Param('id') id: string): Promise<GroupInviteResponse> {
    return this.groups.getInvite(id);
  }

  @Post(':id/invite/revoke')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Invalidate the current invite code and return the new one',
  })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: GroupInviteResponse })
  revokeInvite(@Param('id') id: string): Promise<GroupInviteResponse> {
    return this.groups.revokeInvite(id);
  }

  @Put(':id/picture')
  @ApiOperation({ summary: 'Set the group picture' })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: GroupOkResponse })
  async setPicture(
    @Param('id') id: string,
    @Body() dto: GroupPictureDto,
  ): Promise<GroupOkResponse> {
    await this.groups.setPicture(id, dto);
    return { ok: true };
  }

  @Delete(':id/picture')
  @ApiOperation({ summary: 'Remove the group picture' })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: GroupOkResponse })
  async deletePicture(@Param('id') id: string): Promise<GroupOkResponse> {
    await this.groups.deletePicture(id);
    return { ok: true };
  }

  @Get(':id/membership-requests')
  @ApiOperation({ summary: 'List pending membership requests' })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: [MembershipRequestResponse] })
  membershipRequests(
    @Param('id') id: string,
  ): Promise<MembershipRequestResponse[]> {
    return this.groups.membershipRequests(id);
  }

  @Post(':id/membership-requests/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve membership requests' })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: [ParticipantActionResponse] })
  approveRequests(
    @Param('id') id: string,
    @Body() dto: MembershipRequestActionDto,
  ): Promise<ParticipantActionResponse[]> {
    return this.groups.resolveMembershipRequests(
      id,
      'approve',
      dto.requesterIds ?? [],
    );
  }

  @Post(':id/membership-requests/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject membership requests' })
  @ApiParam(GROUP_ID_PARAM)
  @ApiResponse({ status: 200, type: [ParticipantActionResponse] })
  rejectRequests(
    @Param('id') id: string,
    @Body() dto: MembershipRequestActionDto,
  ): Promise<ParticipantActionResponse[]> {
    return this.groups.resolveMembershipRequests(
      id,
      'reject',
      dto.requesterIds ?? [],
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Leave the group',
    description:
      'Pass deleteChat=true to also remove the conversation from your chat list. Leaving on its own only removes you as a member; WhatsApp keeps the chat.',
  })
  @ApiParam(GROUP_ID_PARAM)
  @ApiQuery({ name: 'deleteChat', required: false, example: false })
  @ApiResponse({ status: 200, type: GroupOkResponse })
  async leave(
    @Param('id') id: string,
    @Query('deleteChat') deleteChat?: string,
  ): Promise<GroupOkResponse> {
    // A group we already left cannot be left again; deleting must still work.
    try {
      await this.groups.leave(id);
    } catch (error) {
      if (deleteChat !== 'true') {
        throw error;
      }
    }

    if (deleteChat === 'true') {
      const deleted = await this.groups.deleteChat(id);
      return { ok: deleted };
    }
    return { ok: true };
  }
}
