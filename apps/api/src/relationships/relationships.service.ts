/* Interface outline: implementation bodies removed. */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';

@Injectable()
export class RelationshipsService {
  constructor(...);
  async getGraph(userId: string);
