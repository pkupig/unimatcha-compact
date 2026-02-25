'use client';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('admin_token');
}

export function setToken(token: string, admin: any) {
  localStorage.setItem('admin_token', token);
  localStorage.setItem('admin_info', JSON.stringify(admin));
}

export function clearAuth() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_info');
}

export function getAdminInfo() {
  if (typeof window === 'undefined') return null;
  const info = localStorage.getItem('admin_info');
  return info ? JSON.parse(info) : null;
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
