/* Interface outline: implementation bodies removed. */
import React, { forwardRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Inbox, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { getAdminInfo, type AdminInfo, type AdminRole } from '@/lib/auth';
import { fenToYuan } from '@/lib/format';
import type {
  AdCampaignStatus,
  AdPricingModel,
  LedgerEntryType,
  WithdrawalStatus,
} from '@/lib/api';

export type BadgeVariant = 'neutral' | 'neon' | 'ink' | 'pink' | 'outline';
export function campaignStatusVariant(status?: AdCampaignStatus | string | null): BadgeVariant;
export function withdrawalStatusVariant(status?: WithdrawalStatus | string | null): BadgeVariant;
export function statusBadgeVariant(status?: string | null): BadgeVariant;
export function Badge(...);
export function StatusBadge(...);
export function PageHeader(...);
export function Card(...);
export function StatCard(...);
export function EmptyState(...);
export function Money(...);
export interface Column<T = any> {
export function DataTable<T = any>(...);
export function Modal(...);
export function ConfirmDialog(...);
export function Tabs(...);
type="button"
export function Field(...);
function Input(...);
function Select(...);
export function RoleGate(...);
  useEffect(() =>;
  setOk(true);
export function useAdminInfo(): AdminInfo | null;
  useEffect(() =>;
  setAdmin(getAdminInfo());
export interface ChartSeries {
export function TrendChart(...);
type="monotone"
export function BarTrend(...);
