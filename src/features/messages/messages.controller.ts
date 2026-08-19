import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { MessageOps } from 'src/infrastructure/whatsapp/message.ops';
import {
  BulkMediaDto,
  BulkTextDto,
  DeleteMessageQueryDto,
  EditMessageDto,
  ForwardDto,
  PinDto,
  ReactDto,
  ReplyDto,
  SendMediaMessageDto,
  SendTextDto,
  StarDto,
} from './messages.dto';
import {
  BulkResponse,
  DeleteMessageResponse,
  MessageResponse,
  OkResponse,
  SentMessageResponse,
} from './messages.response';
import { toChatId } from 'src/infrastructure/utils/phone.util';

const MESSAGE_ID_PARAM = {
  name: 'id',
  description:
    'Serialized message id, e.g. true_573001234567@c.us_3EB0ABC123. URL-encode it.',
  example: 'true_573001234567@c.us_3EB0ABC123',
};

@ApiTags('Messages')
@ApiSecurity('api-key')
@Controller('whatsapp/messages')
export class MessagesController {
  constructor(private readonly messages: MessageOps) {}

  @Post('send')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send a text message to a contact or a group',
    description:
      'Pass a group id (…@g.us) as "to" to post in a group — there is no separate group endpoint.',
  })
  @ApiResponse({ status: 200, type: SentMessageResponse })
  async send(@Body() dto: SendTextDto): Promise<SentMessageResponse> {
    const messageId = await this.messages.sendText(dto.to, dto.message);
    return { to: toChatId(dto.to), messageId };
  }

  @Post('bulk')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send the same text to many recipients, in parallel',
    description:
      'Sends run concurrently (bounded by WWEB_MAX_CONCURRENCY). A failing recipient is reported in results without aborting the batch, so the response is 200 even on partial failure. WARNING: WhatsApp bans numbers that blast many recipients who never wrote first — keep batches small and to known contacts.',
  })
  @ApiResponse({ status: 200, type: BulkResponse })
  sendBulk(@Body() dto: BulkTextDto): Promise<BulkResponse> {
    return this.messages.sendBulk(dto.recipients, dto.message, dto.concurrency);
  }

  @Post('media')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send an image/document by URL or base64' })
  @ApiResponse({ status: 200, type: SentMessageResponse })
  async sendMedia(
    @Body() dto: SendMediaMessageDto,
  ): Promise<SentMessageResponse> {
    const messageId = await this.messages.sendMedia(dto.to, dto);
    return { to: toChatId(dto.to), messageId };
  }

  @Post('media/bulk')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send media to many recipients, in parallel' })
  @ApiResponse({ status: 200, type: BulkResponse })
  sendMediaBulk(@Body() dto: BulkMediaDto): Promise<BulkResponse> {
    return this.messages.sendMediaBulk(dto.recipients, dto, dto.concurrency);
  }

  @Post('reply')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reply to a message, quoting it' })
  @ApiResponse({ status: 200, type: SentMessageResponse })
  async reply(@Body() dto: ReplyDto): Promise<SentMessageResponse> {
    const messageId = await this.messages.reply(
      dto.to,
      dto.message,
      dto.quotedMessageId,
    );
    return { to: toChatId(dto.to), messageId };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a message by id',
    description:
      'Only resolves while the message is still in the WhatsApp Web cache.',
  })
  @ApiParam(MESSAGE_ID_PARAM)
  @ApiResponse({ status: 200, type: MessageResponse })
  get(@Param('id') id: string): Promise<MessageResponse> {
    return this.messages.getMessage(id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a message (optionally for everyone)',
    description:
      'everyone=false (default) removes it only from your view. everyone=true revokes it for all participants: allowed on your own messages within the window WhatsApp permits, or on others messages if you are a group admin. Outside that, it fails with 409.',
  })
  @ApiParam(MESSAGE_ID_PARAM)
  @ApiResponse({ status: 200, type: DeleteMessageResponse })
  async remove(
    @Param('id') id: string,
    @Query() query: DeleteMessageQueryDto,
  ): Promise<DeleteMessageResponse> {
    const everyone = query.everyone === true;
    await this.messages.deleteMessage(id, everyone, query.clearMedia === true);
    return { messageId: id, deletedForEveryone: everyone };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit the text of a message you sent' })
  @ApiParam(MESSAGE_ID_PARAM)
  @ApiResponse({ status: 200, type: OkResponse })
  async edit(
    @Param('id') id: string,
    @Body() dto: EditMessageDto,
  ): Promise<OkResponse> {
    await this.messages.editMessage(id, dto.message);
    return { ok: true };
  }

  @Post(':id/react')
  @HttpCode(200)
  @ApiOperation({
    summary: 'React to a message with an emoji (empty string removes it)',
  })
  @ApiParam(MESSAGE_ID_PARAM)
  @ApiResponse({ status: 200, type: OkResponse })
  async react(
    @Param('id') id: string,
    @Body() dto: ReactDto,
  ): Promise<OkResponse> {
    await this.messages.react(id, dto.reaction);
    return { ok: true };
  }

  @Post(':id/forward')
  @HttpCode(200)
  @ApiOperation({ summary: 'Forward a message to another chat' })
  @ApiParam(MESSAGE_ID_PARAM)
  @ApiResponse({ status: 200, type: OkResponse })
  async forward(
    @Param('id') id: string,
    @Body() dto: ForwardDto,
  ): Promise<OkResponse> {
    await this.messages.forward(id, dto.to);
    return { ok: true };
  }

  @Post(':id/star')
  @HttpCode(200)
  @ApiOperation({ summary: 'Star or unstar a message' })
  @ApiParam(MESSAGE_ID_PARAM)
  @ApiResponse({ status: 200, type: OkResponse })
  async star(
    @Param('id') id: string,
    @Body() dto: StarDto,
  ): Promise<OkResponse> {
    await this.messages.star(id, dto.starred !== false);
    return { ok: true };
  }

  @Post(':id/pin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pin or unpin a message' })
  @ApiParam(MESSAGE_ID_PARAM)
  @ApiResponse({ status: 200, type: OkResponse })
  async pin(@Param('id') id: string, @Body() dto: PinDto): Promise<OkResponse> {
    const ok = await this.messages.pin(
      id,
      dto.pinned !== false,
      dto.durationSeconds ?? 86400,
    );
    return { ok };
  }
}
