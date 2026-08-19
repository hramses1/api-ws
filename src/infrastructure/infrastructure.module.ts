import { Global, Module } from '@nestjs/common';
import { WwebService } from './services/wweb.service';
import { ChatHistoryService } from './services/chat-history.service';
import { WebhookService } from './services/webhook.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ClientPool } from './whatsapp/client-pool';
import { MessageOps } from './whatsapp/message.ops';
import { GroupOps } from './whatsapp/group.ops';
import { ContactOps } from './whatsapp/contact.ops';

/**
 * Global module: a single WhatsApp client and chat history store
 * shared across all feature modules. Prevents spinning up multiple
 * WhatsApp clients (one per feature module).
 *
 * The *Ops services are the only code allowed to touch whatsapp-web.js;
 * feature modules depend on them, never on the library.
 */
@Global()
@Module({
  providers: [
    ClientPool,
    WwebService,
    ChatHistoryService,
    WebhookService,
    ApiKeyGuard,
    MessageOps,
    GroupOps,
    ContactOps,
  ],
  exports: [
    ClientPool,
    WwebService,
    ChatHistoryService,
    WebhookService,
    ApiKeyGuard,
    MessageOps,
    GroupOps,
    ContactOps,
  ],
})
export class InfrastructureModule {}
