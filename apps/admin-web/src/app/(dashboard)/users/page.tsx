/* Interface outline: implementation bodies removed. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Search, Ban, CheckCircle, RefreshCw, Eye } from 'lucide-react';
import {
  getUsers,
  updateUserStatus,
  resetUserMode,
  updateVerificationStatus,
} from '@/lib/api';
import { isUnion } from '@/lib/auth';
import {
  PageHeader,
  Card,
  Badge,
  DataTable,
  EmptyState,
  RoleGate,
  Input,
  Select,
  useAdminInfo,
  type Column,
} from '@/components/ui';
import { formatDate } from '@/lib/format';

type Column,
type ModeState =
function UsersPageInner();
  useEffect(() =>;
  setLoading(true);
  setUsers(data.users || []);
  setTotal(data.total || 0);
  loadUsers();
  loadUsers();
  loadUsers();
type="text"
