import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MatchingService, MATCH_QUEUE, MATCH_JOB } from './matching.service';

@Processor(MATCH_QUEUE)
export class MatchProcessor {
  private readonly logger = new Logger(MatchProcessor.name);

  constructor(private matchingService: MatchingService) {}

  @Process(MATCH_JOB)
  async handleMatchJob(job: Job<{ jobId: string }>) {
    this.logger.log(`Processing match job: ${job.data.jobId}`);
    await this.matchingService.executeMatchJob(job.data.jobId);
  }
}
