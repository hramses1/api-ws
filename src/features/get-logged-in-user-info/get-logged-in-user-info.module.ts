import { Module } from '@nestjs/common';
import { WwebService } from 'src/infrastructure/services/wweb.service';
import { GetLoggedInUserInfoController } from './get-logged-in-user-info.controller';

@Module({
  controllers: [GetLoggedInUserInfoController],
  providers: [WwebService],
})
export class GetLoggedInUserInfoModule {}
