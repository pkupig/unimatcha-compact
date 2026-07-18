import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PurchaseTicketDto } from './dto/events.dto';

/** 活动（用户侧）：详情 / 购票（mock 支付）/ 票夹 */
@ApiTags('活动与门票')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  // 注意放在 :id 之前，避免被参数路由吞掉
  @Get('tickets/mine')
  @ApiOperation({ summary: '我的票夹（含活动信息，二维码内容=code）' })
  myTickets(@CurrentUser('id') userId: string) {
    return this.eventsService.myTickets(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '活动详情（余票 remaining、我已购 myTickets）' })
  getEvent(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.eventsService.getEvent(id, userId);
  }

  @Post(':id/purchase')
  @ApiOperation({ summary: '购票（本期 mock 支付：下单即出票）' })
  purchase(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() _dto: PurchaseTicketDto,
  ) {
    return this.eventsService.purchaseTicket(id, userId);
  }
}
