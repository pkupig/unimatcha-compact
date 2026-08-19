/* Interface outline: implementation bodies removed. */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { fromMatchMode } from '../mode.util';

export type BehaviorType =
interface BehaviorEventInput {
@Injectable()
export class MatchFeedbackService {
  constructor(...);
  async logExposure(...);
  async logEvent(input: BehaviorEventInput): Promise<void>;
  async ingestClientEvents(...);
