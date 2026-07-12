import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RelationshipsService } from './relationships.service';

@ApiTags('关系网')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('relationships')
export class RelationshipsController {
  constructor(private readonly relationships: RelationshipsService) {}

  @Get('graph')
  @ApiOperation({ summary: '关系网图谱：我的直接关系 + 亲密度权重（本轮反馈3）' })
  getGraph(@CurrentUser('id') userId: string) {
    return this.relationships.getGraph(userId);
  }
}
