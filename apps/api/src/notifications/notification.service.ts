/* Interface outline: implementation bodies removed. */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(...);
  async createNotification(userId: string, type: string, title: string, body: string, metadata?: any);
  async createManyNotifications(...);
  async getNotifications(userId: string, page = 1, limit = 20);
  async markRead(userId: string, notificationId?: string);
  async getUnreadCount(userId: string);
