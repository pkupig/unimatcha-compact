/**
 * 问卷域 API（SUPER/TEAM）——契约见 apps/api/src/questionnaire/questionnaire-admin.controller.ts。
 * 已发布（isActive）版本的题目增/改/删会被后端 400「已发布版本的题目不可修改」；
 * toggle 与 reorder 后端未设此闸，但按产品规则界面对激活版本仍禁用排序，仅保留启用/停用。
 */
import { get, post, put, patch, del } from './client';
import type {
  QuestionnaireVersion,
  QuestionnaireVersionBase,
  QuestionnaireVersionDetail,
  Question,
  QuestionBase,
  QuestionPayload,
  CreateQuestionnaireVersionPayload,
} from '@/lib/types';

/**
 * 版本列表（非分页）。全站契约规定非分页列表为 { items }，
 * 但 questionnaire.service.listVersions 现仍返回裸数组——两种形状都归一为数组，
 * 后端补齐 { items } 包装后此处无需改动。
 */
export async function listQuestionnaireVersions(): Promise<QuestionnaireVersion[]> {
  const res = await get<{ items: QuestionnaireVersion[] } | QuestionnaireVersion[]>(
    '/admin/questionnaire/versions',
  );
  return Array.isArray(res) ? res : res.items;
}

export function getQuestionnaireVersion(id: string): Promise<QuestionnaireVersionDetail> {
  return get(`/admin/questionnaire/versions/${id}`);
}

export function createQuestionnaireVersion(
  payload: CreateQuestionnaireVersionPayload,
): Promise<QuestionnaireVersionDetail> {
  return post('/admin/questionnaire/versions', payload);
}

export function publishQuestionnaireVersion(id: string): Promise<QuestionnaireVersionBase> {
  return post(`/admin/questionnaire/versions/${id}/publish`);
}

export function addQuestion(versionId: string, payload: QuestionPayload): Promise<Question> {
  return post(`/admin/questionnaire/versions/${versionId}/questions`, payload);
}

export function updateQuestion(id: string, payload: QuestionPayload): Promise<Question> {
  return put(`/admin/questionnaire/questions/${id}`, payload);
}

export function deleteQuestion(id: string): Promise<QuestionBase> {
  return del(`/admin/questionnaire/questions/${id}`);
}

export function toggleQuestion(id: string, isEnabled: boolean): Promise<QuestionBase> {
  return patch(`/admin/questionnaire/questions/${id}/toggle`, { isEnabled });
}

/** 全量有序 id 数组提交；后端按数组下标重写 order（1 起） */
export function reorderQuestions(versionId: string, questionIds: string[]): Promise<QuestionBase[]> {
  return patch(`/admin/questionnaire/versions/${versionId}/questions/reorder`, { questionIds });
}
