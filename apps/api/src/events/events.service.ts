/* Interface outline: implementation bodies removed. */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminRole, SquareAuthorType, SquareBoard } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SquareService } from '../square/square.service';
import { CreateEventDto } from './dto/events.dto';

@Injectable()
export class EventsService {
  constructor(...);
  async createEvent(adminId: string, dto: CreateEventDto);
  async listEvents(...);
  private assertEventScope(...);
  async updateEventStatus(adminId: string, eventId: string, status: string);
  async listEventTickets(adminId: string, eventId: string);
  async checkinTicket(adminId: string, code: string);
  async getEvent(eventId: string, userId: string);
  async purchaseTicket(eventId: string, userId: string);
  async myTickets(userId: string);
  private generateTicketCode(): string;
