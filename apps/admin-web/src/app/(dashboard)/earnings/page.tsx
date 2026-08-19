/* Interface outline: implementation bodies removed. */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Wallet, Landmark, ReceiptText, HandCoins } from 'lucide-react';
import {
  getFinanceSummary,
  getSchool,
  getWithdrawals,
  createWithdrawal,
  updateSchoolBank,
  type School,
  type LedgerEntry,
  type WithdrawalRequest,
} from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  PageHeader,
  Card,
  StatCard,
  DataTable,
  StatusBadge,
  Money,
  Badge,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  RoleGate,
  useAdminInfo,
  LEDGER_TYPE_LABELS,
  type Column,
} from '@/components/ui';

type School,
type LedgerEntry,
type WithdrawalRequest,
type Column,
function yuanToFen(input: string): number | null;
function Pager(...);
interface SummaryState {
function EarningsInner();
  async (page: number) =>;
  setLedgerLoading(true);
  setSummary(...);
  setLedger(entries);
  setLedgerTotal(d.total ?? d.ledger?.total ?? entries.length);
  setLedgerLoading(false);
  setSchool(s);
  setBankAccountName(s?.bankAccountName || '');
  setBankName(s?.bankName || '');
  setBankAccountNo(s?.bankAccountNo || '');
  async (page: number) =>;
  setWLoading(true);
  setWithdrawals(items);
  setWTotal(d?.total ?? items.length);
  setWLoading(false);
  useEffect(() =>;
  loadSummary(ledgerPage);
  useEffect(() =>;
  loadSchool();
  useEffect(() =>;
  loadWithdrawals(wPage);
  setBankSaving(true);
  setEditingBank(false);
  loadSchool();
  setBankSaving(false);
  setConfirmOpen(true);
  setWithdrawing(true);
  setAmountYuan('');
  setConfirmOpen(false);
  setWPage(1);
  loadWithdrawals(1);
  loadSummary(ledgerPage);
  setWithdrawing(false);
  setEditingBank(false);
  loadSchool();
type="number"
