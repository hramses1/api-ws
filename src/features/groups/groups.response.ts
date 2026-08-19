import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ParticipantActionResponse {
  @ApiProperty({ example: '573001111111@c.us' })
  id: string;

  @ApiProperty({ example: 'ok', enum: ['ok', 'failed'] })
  status: 'ok' | 'failed';

  @ApiPropertyOptional({ example: 200 })
  code?: number;

  @ApiPropertyOptional({ example: 'Participant added' })
  message?: string;
}

export class GroupSummaryResponse {
  @ApiProperty({ example: '120363000000000000@g.us' })
  id: string;

  @ApiProperty({ example: 'Equipo de soporte' })
  name: string;

  @ApiProperty({ example: 12 })
  participantCount: number;

  @ApiProperty({
    example: false,
    description: 'True when only admins can post and you are not one',
  })
  isReadOnly: boolean;

  @ApiProperty({ example: 3 })
  unreadCount: number;
}

export class GroupParticipantResponse {
  @ApiProperty({ example: '573001111111@c.us' })
  id: string;

  @ApiProperty({ example: false })
  isAdmin: boolean;

  @ApiProperty({ example: false })
  isSuperAdmin: boolean;
}

export class GroupDetailResponse extends GroupSummaryResponse {
  @ApiProperty({ example: '573009999999@c.us', nullable: true })
  owner: string | null;

  @ApiProperty({ example: '2026-01-15T18:20:00.000Z', nullable: true })
  createdAt: string | null;

  @ApiProperty({ example: 'Grupo interno del equipo' })
  description: string;

  @ApiProperty({ type: [GroupParticipantResponse] })
  participants: GroupParticipantResponse[];
}

export class CreateGroupResponse {
  @ApiProperty({ example: '120363000000000000@g.us' })
  groupId: string;

  @ApiProperty({ example: 'Equipo de soporte' })
  title: string;

  @ApiProperty({
    type: [ParticipantActionResponse],
    description:
      'Per-participant outcome: someone who blocks group adds fails here without failing the creation',
  })
  participants: ParticipantActionResponse[];
}

export class GroupInviteResponse {
  @ApiProperty({ example: 'AbCdEf1234567' })
  code: string;

  @ApiProperty({ example: 'https://chat.whatsapp.com/AbCdEf1234567' })
  url: string;
}

export class MembershipRequestResponse {
  @ApiProperty({ example: '573001111111@c.us' })
  id: string;

  @ApiProperty({ example: '573009999999@c.us', nullable: true })
  addedBy: string | null;

  @ApiProperty({ example: '2026-08-18T14:00:00.000Z', nullable: true })
  requestedAt: string | null;
}

export class JoinGroupResponse {
  @ApiProperty({ example: '120363000000000000@g.us' })
  groupId: string;
}

export class GroupOkResponse {
  @ApiProperty({ example: true })
  ok: boolean;
}
