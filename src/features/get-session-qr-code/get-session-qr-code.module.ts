import { Module } from '@nestjs/common';
import { GetSessionQrCodeController } from './get-session-qr-code.controller';

@Module({
  controllers: [GetSessionQrCodeController],
  providers: [],
})
export class GetSessionQrCodeModule {}
