import { Module } from '@nestjs/common';
import { GetChatHistoryController } from './get-chat-history.controller';

@Module({
  controllers: [GetChatHistoryController],
  providers: [],
})
export class GetChatHistoryModule {}
