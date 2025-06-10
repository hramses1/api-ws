import { Module } from '@nestjs/common';
import { SendMessageController } from './send-message.controller';
import { SendMessageService } from './send-message.service';
import { WwebService } from 'src/infrastructure/services/wweb.service';

@Module({
  controllers: [SendMessageController],
  providers: [SendMessageService, WwebService],
})
export class SendMessageModule {}
