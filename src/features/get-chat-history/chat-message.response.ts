import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatMessageResponse {
  @ApiProperty({
    example: 'true_573001234567@c.us_3EB0ABC123',
    description: 'Serialized message id (used as quotedMessageId on reply)',
  })
  id: string;

  @ApiProperty({ example: '573001234567@c.us', description: 'Chat id' })
  chatId: string;

  @ApiProperty({ example: '573001234567@c.us', description: 'Sender id' })
  from: string;

  @ApiProperty({ example: '573009999999@c.us', description: 'Recipient id' })
  to: string;

  @ApiProperty({ example: 'Hola, ¿cómo estás?', description: 'Message body' })
  body: string;

  @ApiProperty({ example: false, description: 'True if sent by this account' })
  fromMe: boolean;

  @ApiProperty({ example: 1719500000, description: 'Unix timestamp (seconds)' })
  timestamp: number;

  @ApiPropertyOptional({ example: false, description: 'Message carries media' })
  hasMedia?: boolean;

  @ApiPropertyOptional({ example: 'chat', description: 'Message type' })
  type?: string;
}

export class ChatSummaryResponse {
  @ApiProperty({ example: '573001234567@c.us', description: 'Chat id' })
  chatId: string;

  @ApiPropertyOptional({
    example: '573001234567@c.us',
    description:
      'Phone-number id behind a @lid chat, once resolved. Either this or ' +
      'chatId can be used to fetch the history.',
  })
  phoneNumber?: string;

  @ApiProperty({ type: ChatMessageResponse })
  lastMessage: ChatMessageResponse;

  @ApiProperty({ example: 12, description: 'Messages stored for this chat' })
  count: number;
}
