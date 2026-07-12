import { Injectable, Logger } from '@nestjs/common';
import {
  MatchModelProvider,
  CandidateProfile,
  MatchConstraints,
  MatchResult,
  MatchPair,
} from './match-model.interface';
import type { ModeStr } from '../mode.util';

/**
 * StubMatchModelProvider
 * 默认 Stub 实现：按性别偏好（恋人）/ 直接配对（朋友）随机匹配。
 * 实现新版双模式接口（含增强空池字段，但 stub 不做增强强配）。
 */
@Injectable()
export class StubMatchModelProvider implements MatchModelProvider {
  private readonly logger = new Logger(StubMatchModelProvider.name);

  async generateMatches(
    candidates: CandidateProfile[],
    constraints: MatchConstraints,
  ): Promise<MatchResult> {
    const start = Date.now();
    const mode: ModeStr = constraints.mode;
    this.logger.log(`[Stub] mode=${mode} matching ${candidates.length} candidates...`);

    const pairs: MatchPair[] = [];
    const matched = new Set<string>();
    const topN = mode === 'romantic' ? 1 : Math.max(1, constraints.maxMatchesPerUser || 5);

    const shuffled = [...candidates].sort(() => Math.random() - 0.5);

    for (const candidate of shuffled) {
      if (mode === 'romantic' && matched.has(candidate.userId)) continue;

      // 朋友：每人取最多 topN 个对象（不独占）；恋人：一人一对
      let assigned = 0;
      for (const c of shuffled) {
        if (c.userId === candidate.userId) continue;
        if (mode === 'romantic' && matched.has(c.userId)) continue;

        if (mode === 'romantic') {
          const genderMatch =
            (c.genderPref === 'any' || c.genderPref === candidate.gender) &&
            (candidate.genderPref === 'any' || candidate.genderPref === c.gender);
          if (!genderMatch) continue;
        }

        pairs.push({
          userAId: candidate.userId,
          userBId: c.userId,
          score: Math.random() * 40 + 60,
          enhanced: false,
          metadata: { algorithm: 'stub-random', version: '2.0.0' },
        });
        matched.add(candidate.userId);
        if (mode === 'romantic') {
          matched.add(c.userId);
          break;
        }
        assigned += 1;
        if (assigned >= topN) break;
      }
    }

    const unmatched = candidates
      .filter((c) => !matched.has(c.userId))
      .map((c) => c.userId);

    this.logger.log(
      `[Stub] mode=${mode} done: ${pairs.length} pairs, ${unmatched.length} unmatched in ${Date.now() - start}ms`,
    );

    return {
      pairs,
      unmatched,
      emptyPoolUserIds: [],
      modelVersion: 'stub-2.0.0',
      processingTimeMs: Date.now() - start,
    };
  }
}
