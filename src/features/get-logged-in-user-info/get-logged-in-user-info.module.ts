import { Module } from '@nestjs/common';
import { GetLoggedInUserInfoController } from './get-logged-in-user-info.controller';

@Module({
  controllers: [GetLoggedInUserInfoController],
  providers: [],
})
export class GetLoggedInUserInfoModule {}
