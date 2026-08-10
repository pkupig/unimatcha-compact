/**
 * 后端契约唯一镜像（页面一律 import from '@/lib/types'）。
 * 按域拆文件便于并行维护；本 index 是唯一的导入面。
 * 规则：金额字段恒 *Cents；后端字段改名必须同步这里，禁止在调用点用 ?? 链猜名。
 */
export * from './common';
export * from './users';
export * from './schools';
export * from './accounts';
export * from './ads';
export * from './finance';
export * from './moderation';
export * from './submissions';
export * from './events';
export * from './questionnaire';
export * from './matching';
export * from './settings';
export * from './dashboard';
