import { Controller, Get, HttpCode, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  ChatHistoryService,
  ChatMessage,
} from 'src/infrastructure/services/chat-history.service';
import {
  ChatMessageResponse,
  ChatSummaryResponse,
} from './chat-message.response';

@ApiTags('WhatsApp')
@ApiSecurity('api-key')
@Controller('whatsapp')
export class GetChatHistoryController {
  constructor(private readonly chatHistory: ChatHistoryService) {}

  @Get('chats')
  @HttpCode(200)
  @ApiOperation({ summary: 'List chats with their last message' })
  @ApiResponse({ status: 200, type: ChatSummaryResponse, isArray: true })
  getChats() {
    return this.chatHistory.getChats();
  }

  @Get('chat-history')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get message history of a chat' })
  @ApiQuery({ name: 'cellPhone', example: '573001234567' })
  @ApiResponse({ status: 200, type: ChatMessageResponse, isArray: true })
  getHistory(@Query('cellPhone') cellPhone: string): ChatMessage[] {
    return this.chatHistory.getByChat(cellPhone);
  }

  @Get('chat-history/:chatId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get message history by chatId path param' })
  @ApiParam({ name: 'chatId', example: '573001234567' })
  @ApiResponse({ status: 200, type: ChatMessageResponse, isArray: true })
  getHistoryByParam(@Param('chatId') chatId: string): ChatMessage[] {
    return this.chatHistory.getByChat(chatId);
  }
}
