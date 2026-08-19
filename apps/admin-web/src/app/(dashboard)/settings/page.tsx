/* Interface outline: implementation bodies removed. */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, SlidersHorizontal } from 'lucide-react';
import { api, getPricingDefaults, updatePricingDefaults } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  PageHeader,
  Card,
  RoleGate,
  Field,
  Input,
  Textarea,
  EmptyState,
} from '@/components/ui';

interface SystemConfigRow {
function yuanToCents(v: string): number | undefined;
function SettingsContent();
  useEffect(() =>;
  load();
  setLoading(true);
  setBuyoutYuan(String((pricing?.buyoutDailyPriceCents ?? 0) / 100));
  setCpmYuan(String((pricing?.cpmPriceCents ?? 0) / 100));
  setCpcYuan(String((pricing?.cpcPriceCents ?? 0) / 100));
  setConfigs(rows);
  setDrafts(d);
  setLoading(false);
  setSavingPricing(true);
  setSavingPricing(false);
  setSavingKey(key);
  setConfigs((prev) => prev.map((c) => (c.key === key ?;
  setSavingKey(null);
type="number"
type="number"
type="number"
