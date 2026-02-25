/**
 * AI 匹配模型真实实现示例
 * 使用前：
 *   1. 将此文件重命名为 ai-match-model.provider.ts
 *   2. 在 matching.module.ts 中替换 StubMatchModelProvider
 *   3. 配置 AI_PROVIDER_URL 和 AI_PROVIDER_API_KEY 环境变量
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MatchModelProvider,
  CandidateProfile,
  MatchConstraints,
  MatchResult,
} from './match-model.interface';

@Injectable()
export class AIMatchModelProvider implements MatchModelProvider {
  private readonly logger = new Logger(AIMatchModelProvider.name);

  constructor(private config: ConfigService) {}

  async generateMatches(
    candidates: CandidateProfile[],
    constraints: MatchConstraints,
  ): Promise<MatchResult> {
    const url = this.config.get<string>('AI_PROVIDER_URL');
    const apiKey = this.config.get<string>('AI_PROVIDER_API_KEY');

    if (!url || !apiKey) {
      throw new Error('AI_PROVIDER_URL or AI_PROVIDER_API_KEY not configured');
    }

    this.logger.log(`Calling AI provider with ${candidates.length} candidates`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ candidates, constraints }),
    });

    if (!response.ok) {
      throw new Error(`AI provider returned ${response.status}: ${await response.text()}`);
    }

    const result: MatchResult = await response.json();
    this.logger.log(`AI provider returned ${result.pairs.length} pairs`);
    return result;
  }
}
