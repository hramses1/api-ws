import { ApiProperty } from '@nestjs/swagger';

/** Response shapes of the pre-domain routes, unchanged. */
export class LegacySendMessageResponse {
  @ApiProperty({ description: 'Content of the message to be sent' })
  message: string;

  @ApiProperty({ description: 'WhatsApp phone number' })
  cellPhone: string;

  @ApiProperty({
    description: 'Serialized id of the sent message (use as quotedMessageId)',
    example: 'true_573001234567@c.us_3EB0ABC123',
  })
  messageId: string;
}

export class LegacySendMediaResponse {
  @ApiProperty({ description: 'WhatsApp phone number' })
  cellPhone: string;

  @ApiProperty({ description: 'Serialized id of the sent message' })
  messageId: string;
}

export class LegacyReplyMessageResponse extends LegacySendMessageResponse {
  @ApiProperty({ description: 'Serialized id of the quoted message' })
  quotedMessageId: string;
}

export class CheckNumberResponse {
  @ApiProperty({ example: '573001234567', description: 'Number as supplied' })
  input: string;

  @ApiProperty({
    example: '573001234567@c.us',
    description: 'WhatsApp chat id',
  })
  chatId: string;

  @ApiProperty({
    example: true,
    description: 'Whether the number is registered on WhatsApp',
  })
  isRegistered: boolean;
}
