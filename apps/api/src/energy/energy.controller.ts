/* Interface outline: implementation bodies removed. */
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

@UseGuards(JwtAuthGuard)
@Controller('energy')
export class EnergyController {
  constructor(...);
@Get('balance')
  async getBalance(@CurrentUser('id') userId: string);
@Get('packages')
  async getPackages();
@Post('purchase')
  async purchase(@CurrentUser('id') userId: string, @Body() dto: PurchaseEnergyDto);
@Post('purchase/confirm')
  async confirmPurchase(@CurrentUser('id') userId: string, @Body() dto: ConfirmPurchaseDto);
@Post('claim')
  async claim(@CurrentUser('id') userId: string, @Body() dto: ClaimEnergyDto);
@Get('transactions')
  async getTransactions(@CurrentUser('id') userId: string, @Query() query: TransactionsQueryDto);
