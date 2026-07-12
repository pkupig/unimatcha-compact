import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UsersModule } from '../users/users.module';
import { SquareModule } from '../square/square.module';

@Module({
  imports: [UsersModule, SquareModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
