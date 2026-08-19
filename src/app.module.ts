import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { ApiKeyGuard } from './infrastructure/guards/api-key.guard';
import { validateEnv } from './infrastructure/config/env.validation';
import { MessagesModule } from './features/messages/messages.module';
import { GroupsModule } from './features/groups/groups.module';
import { GetSessionQrCodeModule } from './features/get-session-qr-code/get-session-qr-code.module';
import { GetLoggedInUserInfoModule } from './features/get-logged-in-user-info/get-logged-in-user-info.module';
import { GetChatHistoryModule } from './features/get-chat-history/get-chat-history.module';
import { GetStatusModule } from './features/get-status/get-status.module';
import { HealthModule } from './features/health/health.module';
import { LogoutModule } from './features/logout/logout.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Global rate limit, 30 requests / 60s per IP by default. Avoids spamming
    // WhatsApp (which leads to bans); tune with THROTTLE_TTL/THROTTLE_LIMIT.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get('THROTTLE_TTL') ?? 60000),
          limit: Number(config.get('THROTTLE_LIMIT') ?? 30),
        },
      ],
    }),
    InfrastructureModule,
    MessagesModule,
    GroupsModule,
    GetSessionQrCodeModule,
    GetLoggedInUserInfoModule,
    GetChatHistoryModule,
    GetStatusModule,
    HealthModule,
    LogoutModule,
  ],
  // Order matters: rate-limit first, then API key. Both global; routes opt out
  // of the key check with @Public().
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
