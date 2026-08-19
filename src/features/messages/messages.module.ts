import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { LegacyMessagesController } from './legacy.controller';

/**
 * Everything that acts on a message. Both controllers delegate to MessageOps,
 * provided globally by InfrastructureModule.
 */
@Module({
  controllers: [MessagesController, LegacyMessagesController],
})
export class MessagesModule {}
