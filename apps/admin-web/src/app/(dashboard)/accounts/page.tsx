/* Interface outline: implementation bodies removed. */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Ban, CheckCircle } from 'lucide-react';
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  getSchools,
  type School,
} from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ROLE_LABELS, type AdminRole } from '@/lib/auth';
import {
  PageHeader,
  Card,
  DataTable,
  Badge,
  Modal,
  ConfirmDialog,
  Tabs,
  RoleGate,
  Field,
  Input,
  Select,
  useAdminInfo,
  type Column,
} from '@/components/ui';

type School,
type Column,
interface AccountRow {
type TabKey = 'union' | 'sponsor' | 'admin';
function AccountsContent();
  useEffect(() =>;
  loadSchools();
  useEffect(() =>;
  load();
  setSchools(((res as any).data?.items as School[]) || []);
  setLoading(true);
  listAdminUsers(...);
  listAdminUsers(...);
  setRows(merged);
  setTotal(merged.length);
  setRows((data?.admins as AccountRow[]) || []);
  setTotal(data?.total || 0);
  setLoading(false);
  setTab(key as TabKey);
  setPage(1);
  setForm(...);
  setShowCreate(true);
  setSaving(true);
  setShowCreate(false);
  load();
  setSaving(false);
  setToggling(true);
  setDisableTarget(null);
  load();
  setToggling(false);
  load();
type="email"
type="password"
