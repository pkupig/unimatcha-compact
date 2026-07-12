import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MatchingService, MATCH_QUEUE, MATCH_JOB } from './matching.service';
import { normalizeMode } from './mode.util';

@Processor(MATCH_QUEUE)
export class MatchProcessor {
  private readonly logger = new Logger(MatchProcessor.name);

  constructor(private matchingService: MatchingService) {}

  @Process(MATCH_JOB)
  async handleMatchJob(job: Job<{ jobId: string; mode?: string }>) {
    const mode = normalizeMode(job.data.mode);
    this.logger.log(`Processing match job: ${job.data.jobId} (mode=${mode})`);
    await this.matchingService.executeMatchJob(job.data.jobId, mode);
  }
}
