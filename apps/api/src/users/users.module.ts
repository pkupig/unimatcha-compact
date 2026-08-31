import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersAdminController } from './users-admin.controller';
import { UsersAdminService } from './users-admin.service';
import { ProfilesModule } from '../profiles/profiles.module';
import { AdminCoreModule } from '../admin-core/admin-core.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [ProfilesModule, AdminCoreModule, DiscoveryModule, MailModule],
  providers: [UsersService, UsersAdminService],
  controllers: [UsersController, UsersAdminController],
  exports: [UsersService],
})
export class UsersModule {}
