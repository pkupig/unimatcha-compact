import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async createNotification(userId: string, type: string, title: string, body: string, metadata?: any) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, metadata, isRead: false },
    });
  }

  async createManyNotifications(items: { userId: string; type: string; title: string; body: string; metadata?: any }[]) {
    return this.prisma.notification.createMany({
      data: items.map(i => ({ ...i, isRead: false })),
    });
  }

  async getNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
        select: { id: true, type: true, title: true, body: true, isRead: true, createdAt: true, metadata: true },
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { items, total, unread, page, limit };
  }

  async markRead(userId: string, notificationId?: string) {
    if (notificationId) {
      await this.prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { isRead: true } });
    } else {
      await this.prisma.notification.updateMany({ where: { userId }, data: { isRead: true } });
    }
    return { success: true };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { unreadCount: count };
  }
}
