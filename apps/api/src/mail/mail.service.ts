import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * 通用 SMTP 邮件服务（nodemailer）。
 *
 * 环境变量：MAIL_HOST / MAIL_PORT（默认 465）/ MAIL_SECURE（465 默认 true，587 走 STARTTLS 填 false）
 *          / MAIL_USER / MAIL_PASS / MAIL_FROM（缺省 "Unimatcha <MAIL_USER>"）。
 * 三个必填项（HOST/USER/PASS）不齐时 isConfigured=false，调用方走开发回退（devCode）；
 * 配齐后真实发送，验证码不再出现在响应与日志里。
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null = null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('MAIL_HOST');
    const user = config.get<string>('MAIL_USER');
    const pass = config.get<string>('MAIL_PASS');
    const port = parseInt(config.get<string>('MAIL_PORT') || '465', 10);
    // MAIL_SECURE 显式设了就听它的；留空按端口推导（465 隐式 TLS，587/25 走 STARTTLS）
    const secureRaw = String(config.get('MAIL_SECURE') ?? '').trim();
    const secure = secureRaw ? secureRaw === 'true' : port === 465;
    this.from = config.get<string>('MAIL_FROM') || (user ? `Unimatcha <${user}>` : 'Unimatcha');
    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        // SMTP 挂起不能拖死 API 请求：连接/握手/收发都设超时
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      this.logger.log(`SMTP configured: ${host}:${port} (secure=${secure}) as ${user}`);
      // 启动时探活：凭据/端口配错不该等到第一个真实用户发码才暴露。
      // 只记日志不阻断启动——SMTP 服务临时抖动不应拖垮整个 API。
      this.transporter
        .verify()
        .then(() => this.logger.log('SMTP connection verified'))
        .catch((e: Error) =>
          this.logger.error(`SMTP verify failed (check MAIL_* config): ${e?.message}`),
        );
    } else {
      this.logger.warn('SMTP not configured (MAIL_HOST/MAIL_USER/MAIL_PASS missing) — verification codes fall back to dev mode');
    }
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  /**
   * devCode 开发回退是否允许：仅限非生产环境。
   * 生产漏配 MAIL_* 时发码路径应当 503 fail-loud——静默退化为「验证码随响应直出」
   * 等于注册邮箱验证形同虚设，且零报错、极难被发现。
   */
  get devFallbackAllowed(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  /** 发送 6 位验证码邮件（中英双语）。失败抛 503，不把 SMTP 细节漏给客户端。 */
  async sendVerificationCode(
    to: string,
    code: string,
    kind: 'register' | 'student_verify',
  ): Promise<void> {
    if (!this.transporter) {
      throw new ServiceUnavailableException('Email service is not configured');
    }
    const purposeZh = kind === 'register' ? '注册 Unimatcha 账号' : '学生身份认证';
    const purposeEn = kind === 'register' ? 'signing up for Unimatcha' : 'student verification';
    const subject = `Unimatcha 验证码 ${code} · Your verification code`;
    const text = [
      `你的验证码是：${code}（10 分钟内有效），用于${purposeZh}。`,
      `如非本人操作，请忽略这封邮件。`,
      ``,
      `Your verification code is ${code} (valid for 10 minutes), for ${purposeEn}.`,
      `If you didn't request this, please ignore this email.`,
    ].join('\n');
    const html = `
<div style="max-width:480px;margin:0 auto;padding:32px 24px;font-family:-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;color:#1a1a1a;">
  <div style="font-weight:800;letter-spacing:.2em;font-size:14px;">UNIMATCHA<sup style="color:#7ed321;font-size:9px;">BETA</sup></div>
  <p style="margin:24px 0 8px;font-size:14px;color:#555;">你的验证码（10 分钟内有效），用于${purposeZh}：</p>
  <p style="margin:0 0 20px;font-size:13px;color:#999;">Your verification code (valid for 10 minutes), for ${purposeEn}:</p>
  <div style="display:inline-block;background:#f4f7ee;border-left:4px solid #7ed321;border-radius:8px;padding:14px 28px;font-size:30px;font-weight:800;letter-spacing:.35em;">${code}</div>
  <p style="margin:24px 0 0;font-size:12px;color:#999;">如非本人操作，请忽略这封邮件。<br>If you didn't request this, please ignore this email.</p>
</div>`;
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text, html });
    } catch (e) {
      // 只记收件人与错误信息，不记验证码本身
      this.logger.error(`sendMail failed for ${to} (${kind}): ${(e as Error)?.message}`);
      throw new ServiceUnavailableException('Failed to send verification email, please try again later');
    }
  }
}
