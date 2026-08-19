/* Interface outline: implementation bodies removed. */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, Landmark, Pencil, Users, Megaphone, Wallet, TrendingUp } from 'lucide-react';
import {
  getSchool,
  updateSchool,
  updateSchoolBank,
  getPricingDefaults,
  type School,
  type PricingDefaults,
} from '@/lib/api';
import { fenToYuan, formatNumber } from '@/lib/format';
import { getAdminInfo, isTeam, isUnion } from '@/lib/auth';
import { PageHeader, Card, StatCard, Badge, Modal, Field, Input } from '@/components/ui';

type School,
type PricingDefaults,
function yuanToCents(v: string): number | null | undefined;
function centsToYuanInput(c?: number | null): string;
function pctToBps(v: string): number | undefined;
  useEffect(() =>;
  setOk(true);
  useEffect(() =>;
  load();
  setSchool(s);
  setName(s.name || '');
  setCity(s.city || '');
  setIsActive(!!s.isActive);
  setPlatformPct(String((s.platformShareBps ?? 0) / 100));
  setSelfPct(String((s.selfSourcedShareBps ?? 0) / 100));
  setBuyoutYuan(centsToYuanInput(s.buyoutDailyPriceCents));
  setCpmYuan(centsToYuanInput(s.cpmPriceCents));
  setCpcYuan(centsToYuanInput(s.cpcPriceCents));
  setBankAccountName(s.bankAccountName || '');
  setBankName(s.bankName || '');
  setBankAccountNo(s.bankAccountNo || '');
  setLoading(true);
  getSchool(schoolId),;
  getPricingDefaults(),;
  applySchool((schoolRes as any).data);
  setDefaults((defaultsRes as any).data);
  setLoading(false);
  setSavingBasic(true);
  applySchool(...);
  setSavingBasic(false);
  setSavingShare(true);
  applySchool(...);
  setSavingShare(false);
  setSavingPricing(true);
  applySchool(...);
  setSavingPricing(false);
  setSavingBank(true);
  setShowBank(false);
  applySchool(...);
  setSavingBank(false);
type="button"
type="number"
type="number"
type="number"
type="number"
type="number"
