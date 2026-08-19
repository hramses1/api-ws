import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const TO_DESCRIPTION =
  'Recipient: a phone number in international format (573001234567) or a chat id (573001234567@c.us, 120363000000000000@g.us for a group).';

export class SendTextDto {
  @ApiProperty({ example: '573001234567', description: TO_DESCRIPTION })
  @IsString()
  to: string;

  @ApiProperty({
    example: 'Hola, ¿cómo estás?',
    description: 'Message content to be sent',
    minLength: 1,
  })
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty' })
  message: string;
}

export class MediaDto {
  @ApiPropertyOptional({
    example: 'https://picsum.photos/400',
    description: 'Public URL of the media. Required if base64 is not provided.',
  })
  @ValidateIf((o: MediaDto) => !o.base64)
  @IsString()
  @MinLength(1)
  url?: string;

  @ApiPropertyOptional({
    description: 'Base64-encoded file data. Required if url is not provided.',
  })
  @ValidateIf((o: MediaDto) => !o.url)
  @IsString()
  @MinLength(1)
  base64?: string;

  @ApiPropertyOptional({
    example: 'image/png',
    description: 'MIME type — required when sending base64.',
  })
  @ValidateIf((o: MediaDto) => !!o.base64)
  @IsString()
  mimetype?: string;

  @ApiPropertyOptional({ example: 'invoice.pdf', description: 'File name' })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiPropertyOptional({
    example: 'Aquí está tu factura',
    description: 'Optional caption',
    maxLength: 1024,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;
}

export class SendMediaMessageDto extends MediaDto {
  @ApiProperty({ example: '573001234567', description: TO_DESCRIPTION })
  @IsString()
  to: string;
}

/** Shared by both bulk endpoints. */
class BulkTargetsDto {
  @ApiProperty({
    example: ['573001111111', '573002222222'],
    description:
      'Recipients (phone numbers or chat ids). Duplicates are collapsed. Max 50.',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  recipients: string[];

  @ApiPropertyOptional({
    example: 5,
    description:
      'How many sends run at once. Capped by WWEB_MAX_CONCURRENCY; defaults to it.',
    minimum: 1,
    maximum: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  concurrency?: number;
}

export class BulkTextDto extends BulkTargetsDto {
  @ApiProperty({
    example: 'Hola a todos',
    description: 'Message sent to every recipient',
    minLength: 1,
  })
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty' })
  message: string;
}

export class BulkMediaDto extends BulkTargetsDto {
  @ApiPropertyOptional({ example: 'https://picsum.photos/400' })
  @ValidateIf((o: BulkMediaDto) => !o.base64)
  @IsString()
  @MinLength(1)
  url?: string;

  @ApiPropertyOptional({ description: 'Base64-encoded file data' })
  @ValidateIf((o: BulkMediaDto) => !o.url)
  @IsString()
  @MinLength(1)
  base64?: string;

  @ApiPropertyOptional({ example: 'image/png' })
  @ValidateIf((o: BulkMediaDto) => !!o.base64)
  @IsString()
  mimetype?: string;

  @ApiPropertyOptional({ example: 'invoice.pdf' })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiPropertyOptional({ example: 'Aquí está tu factura', maxLength: 1024 })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;
}

export class ReplyDto extends SendTextDto {
  @ApiProperty({
    example: 'true_573001234567@c.us_3EB0ABC123',
    description:
      'Serialized id of the message to quote (from chat history or a send response)',
  })
  @IsString()
  @MinLength(1, { message: 'quotedMessageId cannot be empty' })
  quotedMessageId: string;
}

export class DeleteMessageQueryDto {
  @ApiPropertyOptional({
    example: true,
    default: false,
    description:
      'Revoke for everyone. Only works on your own messages and within the time window WhatsApp allows; group admins may also revoke others.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  everyone?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Also remove the downloaded media from the device',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  clearMedia?: boolean;
}

export class EditMessageDto {
  @ApiProperty({ example: 'Texto corregido', minLength: 1 })
  @IsString()
  @MinLength(1)
  message: string;
}

export class ReactDto {
  @ApiProperty({
    example: '👍',
    description: 'Emoji to react with. An empty string removes the reaction.',
  })
  @IsString()
  reaction: string;
}

export class ForwardDto {
  @ApiProperty({ example: '573009999999', description: TO_DESCRIPTION })
  @IsString()
  to: string;
}

export class StarDto {
  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  starred?: boolean;
}

export class PinDto {
  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({
    example: 86400,
    default: 86400,
    description: 'How long the pin lasts, in seconds. Ignored when unpinning.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationSeconds?: number;
}
