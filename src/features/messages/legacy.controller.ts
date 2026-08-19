import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { MessageOps } from 'src/infrastructure/whatsapp/message.ops';
import { ContactOps } from 'src/infrastructure/whatsapp/contact.ops';
import {
  LegacyReplyMessageDto,
  LegacySendMediaDto,
  LegacySendMessageDto,
} from './legacy.dto';
import {
  CheckNumberResponse,
  LegacyReplyMessageResponse,
  LegacySendMediaResponse,
  LegacySendMessageResponse,
} from './legacy.response';

/**
 * The routes this API shipped before endpoints were grouped by domain. Same
 * paths, same contracts, now delegating to the ops layer. Marked deprecated in
 * Swagger; the replacements live under `/whatsapp/messages/*`.
 */
@ApiTags('WhatsApp')
@ApiSecurity('api-key')
@Controller('whatsapp')
export class LegacyMessagesController {
  constructor(
    private readonly messages: MessageOps,
    private readonly contacts: ContactOps,
  ) {}

  @Post('send-message')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send a message by whatsapp',
    description: 'Deprecated — use POST /whatsapp/messages/send.',
    deprecated: true,
  })
  @ApiResponse({ status: 200, type: LegacySendMessageResponse })
  async sendMessage(
    @Body() dto: LegacySendMessageDto,
  ): Promise<LegacySendMessageResponse> {
    const messageId = await this.messages.sendText(dto.cellPhone, dto.message);
    return { message: dto.message, cellPhone: dto.cellPhone, messageId };
  }

  @Post('send-media')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send an image/document by URL or base64',
    description: 'Deprecated — use POST /whatsapp/messages/media.',
    deprecated: true,
  })
  @ApiResponse({ status: 200, type: LegacySendMediaResponse })
  async sendMedia(
    @Body() dto: LegacySendMediaDto,
  ): Promise<LegacySendMediaResponse> {
    const messageId = await this.messages.sendMedia(dto.cellPhone, dto);
    return { cellPhone: dto.cellPhone, messageId };
  }

  @Post('reply-message')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reply to a received message, quoting it',
    description: 'Deprecated — use POST /whatsapp/messages/reply.',
    deprecated: true,
  })
  @ApiResponse({ status: 200, type: LegacyReplyMessageResponse })
  async reply(
    @Body() dto: LegacyReplyMessageDto,
  ): Promise<LegacyReplyMessageResponse> {
    const messageId = await this.messages.reply(
      dto.cellPhone,
      dto.message,
      dto.quotedMessageId,
    );
    return {
      message: dto.message,
      cellPhone: dto.cellPhone,
      quotedMessageId: dto.quotedMessageId,
      messageId,
    };
  }

  @Get('check-number')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check if a number is registered on WhatsApp' })
  @ApiQuery({ name: 'cellPhone', example: '573001234567' })
  @ApiResponse({ status: 200, type: CheckNumberResponse })
  checkNumber(
    @Query('cellPhone') cellPhone: string,
  ): Promise<CheckNumberResponse> {
    return this.contacts.checkNumber(cellPhone);
  }
}
