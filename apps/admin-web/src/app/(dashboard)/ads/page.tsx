/* Interface outline: implementation bodies removed. */
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Plus, Megaphone } from 'lucide-react';
import {
  getCampaigns,
  getSchools,
  getAdsOverview,
  type Campaign,
  type School,
} from '@/lib/api';
import { formatDate } from '@/lib/format';
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Money,
  Badge,
  EmptyState,
  Tabs,
  useAdminInfo,
  CAMPAIGN_STATUS_LABELS,
  type Column,
} from '@/components/ui';
import { isUnion, isSponsor } from '@/lib/auth';

type Campaign,
type School,
type Column,
function normalizeList(data: any):;
function Schedule(...);
function SourceBadge(...);
function Pager(...);
function SponsorAds();
  useEffect(() =>;
  setLoading(true);
  setItems(items);
  setTotal(total);
  setLoading(false);
function UnionAds();
  useEffect(() =>;
  getAdsOverview();
  setPendingCount(d?.pendingReviewCount ?? d?.pendingUnionReview ?? null);
  useEffect(() =>;
  setLoading(true);
  setItems(items);
  setTotal(total);
  setLoading(false);
  setTab(k as 'review' | 'school');
  setPage(1);
function TeamAds();
  useEffect(() =>;
  getSchools(...);
  setSchools(Array.isArray(d) ? d : d?.schools || d?.items || []);
  getAdsOverview();
  useEffect(() =>;
  setLoading(true);
  setItems(items);
  setTotal(total);
  setLoading(false);
  setStatus(e.target.value);
  setPage(1);
  setSchoolId(e.target.value);
  setPage(1);
type="button"
  setStatus(pendingActive ? '' : 'PENDING_PLATFORM_REVIEW');
  setPage(1);
