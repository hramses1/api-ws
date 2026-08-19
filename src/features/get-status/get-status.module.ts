import { Module } from '@nestjs/common';
import { GetStatusController } from './get-status.controller';

@Module({
  controllers: [GetStatusController],
})
export class GetStatusModule {}
