import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { RealtimeService } from './realtime.service';

@ApiTags('实时推送')
@Controller('realtime')
export class RealtimeController {
  constructor(
    private realtime: RealtimeService,
    private jwt: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  // EventSource 无法自定义请求头 → token 走查询参数。
  // 全程 TLS；Caddy 默认不记访问日志、Nest 不逐请求记 URL，泄漏面可接受。
  // @Res() 非 passthrough：本路由完全手动管理响应，全局拦截器的包裹对其无效（符合预期）。
  @Public()
  @Get('stream')
  @ApiOperation({ summary: 'SSE 事件流（message/notification），EventSource 以 ?token= 鉴权' })
  async stream(@Query('token') token: string, @Req() req: Request, @Res() res: Response) {
    let userId: string;
    try {
      const payload = this.jwt.verify(token || '', {
        secret: this.config.get('JWT_SECRET'),
      });
      if (payload?.role !== 'user' || !payload?.sub) throw new Error('bad payload');
      userId = payload.sub as string;
    } catch {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    // 与 REST 的 JwtStrategy 同口径：封禁/已删号即刻失效，不能靠 7 天 token 挂长连接
    // （EventSource 收到 401 按规范直接 CLOSED，不会重连风暴）
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!u || u.status === 'BANNED') {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    // no-transform：明示中间层不要压缩/改写（main.ts 的 compression 也按路径豁免了本流）
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    // 就绪帧：客户端据此把轮询降频为兜底
    res.write('data: {"type":"ready"}\n\n');

    this.realtime.addClient(userId, res);
    req.on('close', () => this.realtime.removeClient(userId, res));
  }
}
