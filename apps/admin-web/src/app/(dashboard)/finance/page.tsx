/* Interface outline: implementation bodies removed. */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Banknote, Gift, FileBarChart } from 'lucide-react';
import {
  getWithdrawals,
  reviewWithdrawal,
  markWithdrawalPaid,
  getSchools,
  createGrant,
  getFinanceSummary,
  getRevenueReport,
  type WithdrawalRequest,
  type School,
  type LedgerEntry,
  type RevenueReportRow,
} from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  PageHeader,
  Card,
  DataTable,
  StatusBadge,
  Money,
  Tabs,
  Modal,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  RoleGate,
  WITHDRAWAL_STATUS_LABELS,
  type Column,
} from '@/components/ui';

type WithdrawalRequest,
type School,
type LedgerEntry,
type RevenueReportRow,
type Column,
function normalizeList<T = any>(data: any, key: string):;
function yuanToFen(input: string): number | null;
function Pager(...);
function BankSnapshot(...);
function WithdrawalsTab();
  setLoading(true);
  setItems(items);
  setTotal(total);
  setLoading(false);
  useEffect(() =>;
  load();
  setReview(null);
  setNote('');
  setSubmitting(true);
  closeReview();
  load();
  setSubmitting(false);
  setSubmitting(true);
  setPaidTarget(null);
  load();
  setSubmitting(false);
  setStatus(e.target.value);
  setPage(1);
function GrantsTab();
  useEffect(() =>;
  getSchools(...);
  setSchools(Array.isArray(d) ? d : d?.schools || d?.items || d?.list || []);
  setRecords([]);
  setRecordsLoading(true);
  setRecords(ledger.filter((e) => e.type === 'SPONSOR_GRANT'));
  setRecordsLoading(false);
  useEffect(() =>;
  loadRecords(schoolId);
  setConfirmOpen(true);
  setSubmitting(true);
  setAmountYuan('');
  setNote('');
  setConfirmOpen(false);
  loadRecords(schoolId);
  setSubmitting(false);
type="number"
function toDateInput(d: Date): string;
function RevenueTab();
  useEffect(() =>;
  setLoading(true);
  setRows(Array.isArray(d) ? d : d?.rows || d?.items || d?.list || d?.report || []);
  setLoading(false);
type="date"
type="date"
function FinanceInner();
