/** dashboard 域 API：角色化仪表盘 + 学生会「最近入账」用的 finance 概要 */
import { get } from './client';
import type { DashboardFinanceSummary, DashboardPayload } from '../types';

/** GET /admin/dashboard——后端按当前角色返回三种 payload 之一，页面按 admin.role 收窄 */
export function getDashboard(): Promise<DashboardPayload> {
  return get('/admin/dashboard');
}

/** 学生会仪表盘最近入账：finance 概要端点，取 ledger 最新 limit 行 */
export function getSchoolFinanceSummary(
  schoolId: string,
  limit = 5,
): Promise<DashboardFinanceSummary> {
  return get(`/admin/finance/schools/${schoolId}/summary`, { page: 1, limit });
}
