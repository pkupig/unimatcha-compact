/* Interface outline: implementation bodies removed. */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Zap,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Loader,
  PauseCircle,
} from 'lucide-react';
import { getMatchConfig, updateMatchConfig, triggerMatchJob, getMatchJobs, retryMatchJob } from '@/lib/api';
import {
  PageHeader,
  Card,
  Badge,
  DataTable,
  EmptyState,
  Field,
  Input,
  RoleGate,
  type BadgeVariant,
  type Column,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';

type BadgeVariant,
type Column,
function MatchingInner();
  useEffect(() =>;
  loadConfig();
  loadJobs();
  setConfig(data);
  setJobs((res as any).data?.jobs || []);
  setEditingConfig(false);
  loadConfig();
  setTriggering(true);
  setTimeout(loadJobs, 1000);
  loadJobs();
type="text"
type="text"
type="checkbox"
