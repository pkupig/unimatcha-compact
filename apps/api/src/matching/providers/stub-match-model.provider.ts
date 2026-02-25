import { Injectable, Logger } from '@nestjs/common';
import {
  MatchModelProvider,
  CandidateProfile,
  MatchConstraints,
  MatchResult,
  MatchPair,
} from './match-model.interface';

/**
 * StubMatchModelProvider
 * 默认 Stub 实现：按性别偏好随机匹配
 * 替换为真实 AI 模型时，只需实现 MatchModelProvider 接口
 */
@Injectable()
export class StubMatchModelProvider implements MatchModelProvider {
  private readonly logger = new Logger(StubMatchModelProvider.name);

  async generateMatches(
    candidates: CandidateProfile[],
    constraints: MatchConstraints,
  ): Promise<MatchResult> {
    const start = Date.now();
    this.logger.log(`[Stub] Matching ${candidates.length} candidates...`);

    const pairs: MatchPair[] = [];
    const matched = new Set<string>();

    // Simple rule: match by mutual gender preference
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);

    for (const candidate of shuffled) {
      if (matched.has(candidate.userId)) continue;

      const partner = shuffled.find((c) => {
        if (c.userId === candidate.userId) return false;
        if (matched.has(c.userId)) return false;

        const genderMatch =
          (c.genderPref === 'any' || c.genderPref === candidate.gender) &&
          (candidate.genderPref === 'any' || candidate.genderPref === c.gender);

        return genderMatch;
      });

      if (partner) {
        pairs.push({
          userAId: candidate.userId,
          userBId: partner.userId,
          score: Math.random() * 40 + 60, // stub score 60-100
          metadata: { algorithm: 'stub-random', version: '1.0.0' },
        });
        matched.add(candidate.userId);
        matched.add(partner.userId);
      }
    }

    const unmatched = candidates
      .filter((c) => !matched.has(c.userId))
      .map((c) => c.userId);

    this.logger.log(
      `[Stub] Done: ${pairs.length} pairs, ${unmatched.length} unmatched in ${Date.now() - start}ms`,
    );

    return {
      pairs,
      unmatched,
      modelVersion: 'stub-1.0.0',
      processingTimeMs: Date.now() - start,
    };
  }
}
