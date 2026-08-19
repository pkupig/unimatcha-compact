/* Interface outline: implementation bodies removed. */
import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class MetadataService {
  private loadJson(filename: string): string[];
  private sortAlpha(items: string[]): string[];
  getUkCities(): string[];
  getUkUniversities(): string[];
  getUkMajors(): string[];
  getMbtiTypes(): string[];
  getCommonNationalities(): string[];
