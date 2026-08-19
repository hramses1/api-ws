import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ example: 'Equipo de soporte', minLength: 1 })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({
    example: ['573001111111', '573002222222'],
    description: 'Phone numbers or contact ids to add on creation',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  participants: string[];
}

export class UpdateGroupDto {
  @ApiPropertyOptional({ example: 'Nuevo nombre del grupo' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ example: 'Descripción del grupo' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class ParticipantsDto {
  @ApiProperty({
    example: ['573001111111'],
    description: 'Phone numbers or contact ids',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  participants: string[];
}

export class GroupSettingsDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Only admins can send messages',
  })
  @IsOptional()
  @IsBoolean()
  messagesAdminsOnly?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Only admins can edit the group info (title, description, photo)',
  })
  @IsOptional()
  @IsBoolean()
  infoAdminsOnly?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Only admins can add new members',
  })
  @IsOptional()
  @IsBoolean()
  addMembersAdminsOnly?: boolean;
}

export class JoinGroupDto {
  @ApiProperty({
    example: 'AbCdEf1234567',
    description: 'Invite code, or the full https://chat.whatsapp.com/... link',
  })
  @IsString()
  @MinLength(1)
  inviteCode: string;
}

export class GroupPictureDto {
  @ApiPropertyOptional({
    example: 'https://picsum.photos/400',
    description: 'Public image URL. Required if base64 is not provided.',
  })
  @ValidateIf((o: GroupPictureDto) => !o.base64)
  @IsString()
  @MinLength(1)
  url?: string;

  @ApiPropertyOptional({ description: 'Base64 image data' })
  @ValidateIf((o: GroupPictureDto) => !o.url)
  @IsString()
  @MinLength(1)
  base64?: string;

  @ApiPropertyOptional({ example: 'image/png' })
  @ValidateIf((o: GroupPictureDto) => !!o.base64)
  @IsString()
  mimetype?: string;
}

export class MembershipRequestActionDto {
  @ApiPropertyOptional({
    example: ['573001111111'],
    description: 'Requesters to act on. Omit to act on every pending request.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requesterIds?: string[];
}
