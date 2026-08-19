/* Interface outline: implementation bodies removed. */

export type AdminRole = 'SUPER' | 'TEAM' | 'STUDENT_UNION' | 'SPONSOR';
export interface AdminInfo {
export function isTeam(role?: AdminRole | string | null): boolean;
export function isUnion(role?: AdminRole | string | null): boolean;
export function isSponsor(role?: AdminRole | string | null): boolean;
export function getToken(): string | null;
export function setToken(token: string, admin: AdminInfo);
export function clearAuth();
export function getAdminInfo(): AdminInfo | null;
export function isAuthenticated(): boolean;
