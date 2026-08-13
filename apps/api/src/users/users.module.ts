import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ProfilesModule } from '../profiles/profiles.module';
import { DiscoveryModule } from '../discovery/discovery.module';

@Module({
  imports: [ProfilesModule, DiscoveryModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
