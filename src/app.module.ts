import { Module } from '@nestjs/common';
import { SendMessageModule } from './features/send-message/send-message.module';
import { GetSessionQrCodeModule } from './features/get-session-qr-code/get-session-qr-code.module';
import { GetLoggedInUserInfoModule } from './features/get-logged-in-user-info/get-logged-in-user-info.module';

@Module({
  imports: [
    SendMessageModule,
    GetSessionQrCodeModule,
    GetLoggedInUserInfoModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
