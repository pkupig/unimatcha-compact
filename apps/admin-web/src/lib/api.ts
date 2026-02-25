import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach admin token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('admin_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401
api.interceptors.response.use(
  (res) => res.data?.data !== undefined ? { ...res, data: res.data.data } : res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
    }
    return Promise.reject(err.response?.data || err);
  },
);

// Auth
export const adminLogin = (email: string, password: string) =>
  api.post('/admin/auth/login', { email, password });

// Dashboard
export const getDashboard = () => api.get('/admin/dashboard');

// Users
export const getUsers = (params?: any) => api.get('/admin/users', { params });
export const getUserDetail = (id: string) => api.get(`/admin/users/${id}`);
export const updateUserStatus = (id: string, status: string) =>
  api.patch(`/admin/users/${id}/status`, { status });
export const resetUserMode = (id: string) => api.patch(`/admin/users/${id}/reset-mode`);

// Questionnaire
export const getQVersions = () => api.get('/admin/questionnaire/versions');
export const getQVersion = (id: string) => api.get(`/admin/questionnaire/versions/${id}`);
export const createQVersion = (data: any) => api.post('/admin/questionnaire/versions', data);
export const publishQVersion = (id: string) => api.post(`/admin/questionnaire/versions/${id}/publish`);
export const addQuestion = (versionId: string, data: any) =>
  api.post(`/admin/questionnaire/versions/${versionId}/questions`, data);
export const updateQuestion = (id: string, data: any) => api.put(`/admin/questionnaire/questions/${id}`, data);
export const deleteQuestion = (id: string) => api.delete(`/admin/questionnaire/questions/${id}`);
export const toggleQuestion = (id: string, isEnabled: boolean) =>
  api.patch(`/admin/questionnaire/questions/${id}/toggle`, { isEnabled });

// Matching
export const getMatchConfig = () => api.get('/admin/matching/config');
export const updateMatchConfig = (data: any) => api.put('/admin/matching/config', data);
export const triggerMatchJob = () => api.post('/admin/matching/jobs/trigger');
export const getMatchJobs = (params?: any) => api.get('/admin/matching/jobs', { params });
export const getMatchJobDetail = (id: string) => api.get(`/admin/matching/jobs/${id}`);
export const retryMatchJob = (id: string) => api.post(`/admin/matching/jobs/${id}/retry`);
export const getMatchResults = (params?: any) => api.get('/admin/matching/results', { params });
