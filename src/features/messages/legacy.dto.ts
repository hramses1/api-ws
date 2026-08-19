import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { MediaDto } from './messages.dto';

/**
 * DTOs for the pre-domain routes (`/whatsapp/send-message`, `send-media`,
 * `reply-message`). Kept verbatim so existing clients keep working; new work
 * should use the `/whatsapp/messages/*` endpoints and their `to` field.
 */
export class LegacySendMessageDto {
  @ApiProperty({
    example: 'Hola, ¿cómo estás?',
    description: 'Message content to be sent',
    minLength: 1,
  })
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty' })
  message: string;

  @ApiProperty({
    example: '573001234567',
    description:
      'WhatsApp phone number in international format (e.g. 573001234567)',
  })
  @IsString()
  cellPhone: string;
}

export class LegacySendMediaDto extends MediaDto {
  @ApiProperty({
    example: '573001234567',
    description: 'WhatsApp phone number in international format',
  })
  @IsString()
  cellPhone: string;
}

export class LegacyReplyMessageDto extends LegacySendMessageDto {
  @ApiProperty({
    example: 'true_573001234567@c.us_3EB0...',
    description:
      'Serialized id of the received message to quote (from chat history)',
  })
  @IsString()
  @MinLength(1, { message: 'quotedMessageId cannot be empty' })
  quotedMessageId: string;
}
