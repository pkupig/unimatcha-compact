/**
 * questionnaire 域契约类型——镜像 apps/api/src/questionnaire/questionnaire.service.ts
 * Admin CRUD 各响应形状与 dto/questionnaire.dto.ts 写载荷。
 */

export type QuestionnaireTypeValue = 'ROMANTIC' | 'FRIEND';
export type QuestionTypeValue = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SCALE' | 'TEXT';

/** 选择题选项 */
export interface QuestionOption {
  id: string;
  questionId: string;
  label: string;
  value: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** 题目基础形（delete/toggle/reorder 响应不带 options include） */
export interface QuestionBase {
  id: string;
  questionnaireId: string;
  type: QuestionTypeValue;
  title: string;
  /** 英文题面：由翻译回填脚本维护；后台 DTO 无此字段，前端只读展示 */
  titleEn: string | null;
  description: string | null;
  isRequired: boolean;
  isEnabled: boolean;
  order: number;
  group: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 版本详情内的题目（含按 order 升序的选项） */
export interface Question extends QuestionBase {
  options: QuestionOption[];
}

/** 版本基础形（publish 响应不带任何 include） */
export interface QuestionnaireVersionBase {
  id: string;
  version: number;
  type: QuestionnaireTypeValue;
  title: string;
  description: string | null;
  isActive: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET versions 列表项（带题目数/作答数计数） */
export interface QuestionnaireVersion extends QuestionnaireVersionBase {
  _count: { questions: number; answers: number };
}

/** GET versions/:id 详情（题目按 order 升序） */
export interface QuestionnaireVersionDetail extends QuestionnaireVersionBase {
  questions: Question[];
}

// ── 写载荷（镜像 questionnaire.dto.ts） ──────────────────────

export interface QuestionOptionPayload {
  label: string;
  value: string;
  order: number;
}

/** CreateQuestionDto 与 UpdateQuestionDto 后端同形（type/title 恒必填，无 PartialType） */
export interface QuestionPayload {
  type: QuestionTypeValue;
  title: string;
  description?: string;
  isRequired?: boolean;
  isEnabled?: boolean;
  order?: number;
  group?: string;
  options?: QuestionOptionPayload[];
}

export interface CreateQuestionnaireVersionPayload {
  type: QuestionnaireTypeValue;
  title: string;
  description?: string;
  questions?: QuestionPayload[];
}
