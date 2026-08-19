import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * pg_trgm 是否可用。搜索的相关性排序用 similarity()，而建扩展的脚本
   * （prisma/ensure-search-indexes.ts）刻意「失败不阻断启动」——托管库不开放扩展时
   * 搜索应当降级为纯 ILIKE，而不是整个搜索端点 500。
   * 结果只探测一次并缓存：扩展不会在进程生命周期内被装上或卸掉。
   */
  private trgmAvailable: boolean | null = null;
  async hasTrgm(): Promise<boolean> {
    if (this.trgmAvailable !== null) return this.trgmAvailable;
    try {
      const rows = await this.$queryRaw<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM pg_extension WHERE extname = 'pg_trgm' LIMIT 1`;
      this.trgmAvailable = rows.length > 0;
    } catch {
      this.trgmAvailable = false;
    }
    if (!this.trgmAvailable) {
      this.logger.warn('pg_trgm not installed — search falls back to unranked ILIKE');
    }
    return this.trgmAvailable;
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('cleanDatabase() is not allowed in production');
    }
    const models = Reflect.ownKeys(this).filter((key) => key[0] !== '_');
    return Promise.all(models.map((modelKey) => (this as any)[modelKey]?.deleteMany?.()));
  }

  /**
   * 对 User.settings（单个 JSON 列）做行锁串行化的读-改-写。
   * 多个端点（隐私开关 / 备注 / 聊天背景 / 情侣封面 / 拍一拍后缀）各自读整块 settings、
   * 改一个兄弟键、整块写回。纯事务在 Read Committed 下仍会丢更新（两事务读到同一旧值后互相覆盖）；
   * `SELECT ... FOR UPDATE` 锁住该用户行，后到的写入阻塞到前者提交后再基于最新值合并。
   * mutate 收到当前 settings 的浅拷贝，返回要持久化的完整 settings 对象。
   */
  async updateUserSettings(
    userId: string,
    mutate: (current: Record<string, any>) => Record<string, any>,
  ): Promise<Record<string, any>> {
    return this.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ settings: any }>>`
        SELECT settings FROM users WHERE id = ${userId} FOR UPDATE`;
      if (rows.length === 0) {
        throw new Error(`updateUserSettings: user ${userId} not found`);
      }
      const cur = rows[0].settings;
      const current = (cur && typeof cur === 'object' ? cur : {}) as Record<string, any>;
      const next = mutate({ ...current });
      await tx.user.update({ where: { id: userId }, data: { settings: next } });
      return next;
    });
  }
}
