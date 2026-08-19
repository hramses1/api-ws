import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SentMessageResponse {
  @ApiProperty({
    example: '573001234567@c.us',
    description: 'Resolved chat id',
  })
  to: string;

  @ApiProperty({
    example: 'true_573001234567@c.us_3EB0ABC123',
    description: 'Serialized id of the sent message (use as quotedMessageId)',
  })
  messageId: string;
}

export class BulkItemResponse {
  @ApiProperty({ example: '573001111111@c.us' })
  to: string;

  @ApiProperty({ example: 'sent', enum: ['sent', 'failed'] })
  status: 'sent' | 'failed';

  @ApiPropertyOptional({ example: 'true_573001111111@c.us_3EB0ABC123' })
  messageId?: string;

  @ApiPropertyOptional({ example: 'Chat not found' })
  error?: string;
}

export class BulkResponse {
  @ApiProperty({ example: 3, description: 'Recipients after deduplication' })
  total: number;

  @ApiProperty({ example: 2 })
  sent: number;

  @ApiProperty({ example: 1 })
  failed: number;

  @ApiProperty({
    type: [BulkItemResponse],
    description: 'One entry per recipient, in the order they were supplied',
  })
  results: BulkItemResponse[];
}

export class MessageResponse {
  @ApiProperty({ example: 'true_573001234567@c.us_3EB0ABC123' })
  id: string;

  @ApiProperty({ example: '573001234567@c.us' })
  chatId: string;

  @ApiProperty({ example: '573001234567@c.us' })
  from: string;

  @ApiProperty({ example: '573009999999@c.us' })
  to: string;

  @ApiProperty({ example: 'Hola' })
  body: string;

  @ApiProperty({ example: false })
  fromMe: boolean;

  @ApiProperty({ example: 1755500000 })
  timestamp: number;

  @ApiProperty({ example: false })
  hasMedia: boolean;

  @ApiProperty({ example: 'chat' })
  type: string;

  @ApiPropertyOptional({ example: false })
  isStarred?: boolean;

  @ApiPropertyOptional({ example: false })
  isForwarded?: boolean;
}

export class DeleteMessageResponse {
  @ApiProperty({ example: 'true_573001234567@c.us_3EB0ABC123' })
  messageId: string;

  @ApiProperty({ example: true })
  deletedForEveryone: boolean;
}

export class OkResponse {
  @ApiProperty({ example: true })
  ok: boolean;
}
