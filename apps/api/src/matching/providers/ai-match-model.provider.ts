/**
 * AI 匹配模型 Provider —— 调用 matching-ml 服务（BACKLOG P0-1）
 * 契约：POST {candidates, constraints} → MatchResult（与 matching-ml/app/schemas.py 逐字段一致）
 *
 * 环境变量：
 *   AI_PROVIDER_URL         http://<host>:8100/match（必须含 /match 路径）
 *   AI_PROVIDER_API_KEY     与 matching-ml 侧 MATCH_API_KEY 一致；未设则不发 Authorization（仅限本地）
 *   AI_PROVIDER_TIMEOUT_MS  请求超时，缺省 300000（大池 + LLM 路径可能耗时数分钟）
 *
 * 生效开关在 matching.module.ts：MATCH_MODEL=ai|scoring（缺省有 AI_PROVIDER_URL 即 ai）。
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
    if (!url) {
      throw new Error('AI_PROVIDER_URL not configured');
    }
    const apiKey = this.config.get<string>('AI_PROVIDER_API_KEY');
    if (!apiKey) {
      this.logger.warn('AI_PROVIDER_API_KEY not set — calling matching-ml without Authorization');
    }
    const timeoutMs = Number(this.config.get('AI_PROVIDER_TIMEOUT_MS') ?? 300_000);

    this.logger.log(
      `Calling AI provider with ${candidates.length} candidates (mode=${constraints.mode})`,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ candidates, constraints }),
        signal: controller.signal,
      });
    } catch (e: any) {
      throw new Error(
        `AI provider request failed: ${
          e?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : e?.message ?? e
        }`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // 上游 422 会把请求体（候选人资料 = PII）回显在 body 里：body 只进 debug 日志；
      // 抛出的消息（会持久化到 MatchJob.errorMessage）保持无 PII（对抗性审查确认项）
      const body = (await response.text().catch(() => '')).slice(0, 500);
      this.logger.debug(`AI provider ${response.status} response body: ${body}`);
      throw new Error(`AI provider returned ${response.status} ${response.statusText}`.trim());
    }

    const result = (await response.json()) as MatchResult;
    // 最小结构校验：残缺响应宁可让 job FAILED（可重试），不可静默当空结果吞掉本轮匹配
    if (!result || !Array.isArray(result.pairs) || !Array.isArray(result.unmatched)) {
      throw new Error('AI provider returned malformed MatchResult (missing pairs/unmatched)');
    }

    this.logger.log(
      `AI provider returned ${result.pairs.length} pairs, ${result.unmatched.length} unmatched ` +
        `(${result.modelVersion ?? 'unknown model'}, ${result.processingTimeMs ?? '?'}ms)`,
    );
    return result;
  }
}
