import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EnergyService, ENERGY_PACKAGES } from './energy.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ClaimEnergyDto,
  ConfirmPurchaseDto,
  PurchaseEnergyDto,
  TransactionsQueryDto,
} from './dto/energy.dto';

/**
 * 能量系统（增强模式付费，§10.4）。路由前缀 /energy，均需登录。
 */
@ApiTags('能量（增强模式付费）')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('energy')
export class EnergyController {
  constructor(private readonly energyService: EnergyService) {}

  @Get('balance')
  @ApiOperation({ summary: '获取能量余额（totalEnergy / usedEnergy / availableEnergy）' })
  async getBalance(@CurrentUser('id') userId: string) {
    return this.energyService.getBalanceView(userId);
  }

  @Get('packages')
  @ApiOperation({ summary: '获取充值档位（pkg_30 / pkg_60 / pkg_100）' })
  async getPackages() {
    return Object.entries(ENERGY_PACKAGES).map(([packageId, p]) => ({
      packageId,
      cells: p.cells,
      priceCny: p.priceCny,
    }));
  }

  @Post('purchase')
  @ApiOperation({ summary: '发起充值下单（本期 mock，返回订单号 + paymentIntent）' })
  async purchase(@CurrentUser('id') userId: string, @Body() dto: PurchaseEnergyDto) {
    return this.energyService.purchase(userId, dto.packageId);
  }

  @Post('purchase/confirm')
  @ApiOperation({ summary: '支付回调入账（本期 mock，直接 recharge 成功）' })
  async confirmPurchase(@CurrentUser('id') userId: string, @Body() dto: ConfirmPurchaseDto) {
    return this.energyService.confirmRecharge(userId, dto.orderId, dto.packageId, dto.transactionId);
  }

  @Post('claim')
  @ApiOperation({ summary: '免费领取能量（registration / daily-checkin / task-complete）' })
  async claim(@CurrentUser('id') userId: string, @Body() dto: ClaimEnergyDto) {
    return this.energyService.claim(userId, dto.claimType, dto.taskKey);
  }

  @Get('transactions')
  @ApiOperation({ summary: '能量流水分页查询' })
  async getTransactions(@CurrentUser('id') userId: string, @Query() query: TransactionsQueryDto) {
    return this.energyService.getTransactions(userId, query.page ?? 1, query.limit ?? 20);
  }
}
