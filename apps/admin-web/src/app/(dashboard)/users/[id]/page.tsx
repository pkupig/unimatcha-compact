/* Interface outline: implementation bodies removed. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { getUserDetail } from '@/lib/api';
import {
  PageHeader,
  Card,
  Badge,
  EmptyState,
  RoleGate,
  type BadgeVariant,
} from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/format';

type BadgeVariant,
function UserDetailInner(...);
  useEffect(() =>;
  setUser((res as any).data);
