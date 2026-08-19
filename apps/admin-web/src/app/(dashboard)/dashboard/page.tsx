/* Interface outline: implementation bodies removed. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Users,
  School,
  Megaphone,
  Banknote,
  Wallet,
  ShieldCheck,
  Send,
  ClipboardList,
  Zap,
  Plus,
  ArrowRight,
  Eye,
  MousePointerClick,
} from 'lucide-react';
import {
  getDashboard,
  getAdsOverview,
  getFinanceSummary,
  type AdsOverview,
  type LedgerEntry,
} from '@/lib/api';
import { getAdminInfo, isUnion, isSponsor, type AdminInfo } from '@/lib/auth';
import { fenToYuan, formatNumber, formatDateTime, formatShortDate } from '@/lib/format';
import {
  PageHeader,
  StatCard,
  Card,
  DataTable,
  Money,
  TrendChart,
  EmptyState,
  LEDGER_TYPE_LABELS,
  type Column,
} from '@/components/ui';

type AdsOverview,
type LedgerEntry,
type Column,
  useEffect(() =>;
  setAdmin(getAdminInfo());
  setLoading(false);
function TeamDashboard(...);
function ActionChip(...);
function UnionDashboard(...);
  useEffect(() =>;
  getFinanceSummary(...);
function SponsorDashboard(...);
