/* Interface outline: implementation bodies removed. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  ArrowLeft,
  ExternalLink,
  Megaphone,
  Pencil,
  MousePointerClick,
  Eye,
  Percent,
  Wallet,
} from 'lucide-react';
import {
  getCampaign,
  getCampaignStats,
  submitCampaign,
  reviewCampaign,
  confirmCampaignPayment,
  pauseCampaign,
  resumeCampaign,
  suspendCampaign,
  unsuspendCampaign,
  type Campaign,
  type AdDailyStatPoint,
} from '@/lib/api';
import { formatDate, formatDateTime, formatNumber, formatShortDate, fenToYuan } from '@/lib/format';
import {
  PageHeader,
  Card,
  StatCard,
  StatusBadge,
  Badge,
  Money,
  Modal,
  Textarea,
  TrendChart,
  EmptyState,
  useAdminInfo,
  PRICING_MODEL_LABELS,
} from '@/components/ui';
import { isTeam, isUnion, isSponsor } from '@/lib/auth';

type Campaign,
type AdDailyStatPoint,
type ActionKind =
interface ActionConfig {
function normalizeStats(data: any): AdDailyStatPoint[];
  setLoading(true);
  setCampaign((res as any).data || null);
  setCampaign(null);
  setLoading(false);
  getCampaignStats(id);
  useEffect(() =>;
  load();
  setNote('');
  setAction(kind);
  setActing(true);
  setAction(null);
  load();
  setActing(false);
