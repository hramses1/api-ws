import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';

/** Group lifecycle and administration. GroupOps comes from InfrastructureModule. */
@Module({
  controllers: [GroupsController],
})
export class GroupsModule {}
