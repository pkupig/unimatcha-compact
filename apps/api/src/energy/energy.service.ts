/* Interface outline: implementation bodies removed. */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ModeStr } from '../matching/mode.util';
import type { EnergyClaimType, EnergyPackageId } from './dto/energy.dto';

export interface BalanceView {
@Injectable()
export class EnergyService {
  constructor(...);
  async getOrCreateBalance(...);
  async getAvailableEnergy(userId: string): Promise<number>;
  async getBalanceView(userId: string): Promise<BalanceView>;
  async consumeInTx(...);
  async consume(...);
  async refund(...);
  async refundInTx(...);
  async recharge(...);
  async purchase(userId: string, packageId: EnergyPackageId);
  async confirmRecharge(...);
  async claim(userId: string, claimType: EnergyClaimType, taskKey?: string);
  private claimDedupeKey(userId: string, claimType: EnergyClaimType, taskKey?: string): string;
  private claimAlreadyMessage(claimType: EnergyClaimType): string;
  private async assertNotClaimed(...);
  private claimReason(claimType: EnergyClaimType): string;
  async getTransactions(userId: string, page = 1, limit = 20);
