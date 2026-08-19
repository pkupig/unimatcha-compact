/* Interface outline: implementation bodies removed. */
import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MatchingService, MATCH_QUEUE, MATCH_JOB } from './matching.service';
import { normalizeMode } from './mode.util';

export class MatchProcessor {
  constructor(...);
  async handleMatchJob(...);
