import { Module } from '@nestjs/common';
import { RelationshipsController } from './relationships.controller';
import { RelationshipsService } from './relationships.service';
import { ProfilesModule } from '../profiles/profiles.module';

// 关系网（本轮反馈3）。PrismaModule 为 @Global；ProfilesModule 提供 ProfilesService。
@Module({
  imports: [ProfilesModule],
  controllers: [RelationshipsController],
  providers: [RelationshipsService],
})
export class RelationshipsModule {}
