import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class MetadataService {
  private readonly logger = new Logger(MetadataService.name);
  private readonly seedDir = path.join(__dirname, 'seed');

  private loadJson(filename: string): string[] {
    try {
      const filePath = path.join(this.seedDir, filename);
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as string[];
    } catch (err) {
      this.logger.error(
        `Failed to load metadata seed '${filename}' from ${this.seedDir}: ${(err as Error).message}`,
      );
      return [];
    }
  }

  // 城市/大学/专业列表统一按字母 A-Z 排序后返回
  private sortAlpha(items: string[]): string[] {
    return [...items].sort((a, b) => a.localeCompare(b));
  }

  getUkCities(): string[] {
    return this.sortAlpha(this.loadJson('uk_cities.json'));
  }

  getUkUniversities(): string[] {
    return this.sortAlpha(this.loadJson('uk_universities.json'));
  }

  getUkMajors(): string[] {
    return this.sortAlpha(this.loadJson('uk_majors.json'));
  }

  getMbtiTypes(): string[] {
    return [
      'INTJ', 'INTP', 'ENTJ', 'ENTP',
      'INFJ', 'INFP', 'ENFJ', 'ENFP',
      'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
      'ISTP', 'ISFP', 'ESTP', 'ESFP',
    ];
  }

  getCommonNationalities(): string[] {
    return [
      'British', 'Chinese', 'Indian', 'American', 'Canadian',
      'Australian', 'German', 'French', 'Italian', 'Spanish',
      'Portuguese', 'Polish', 'Romanian', 'Ukrainian', 'Turkish',
      'Nigerian', 'Ghanaian', 'Pakistani', 'Bangladeshi', 'Sri Lankan',
      'Nepalese', 'Malaysian', 'Singaporean', 'Hong Kongese', 'Taiwanese',
      'Japanese', 'Korean', 'Vietnamese', 'Thai', 'Indonesian',
      'Brazilian', 'Mexican', 'Colombian', 'Argentinian', 'Egyptian',
      'Saudi Arabian', 'Iranian', 'Iraqi', 'Israeli', 'Other',
    ];
  }
}
