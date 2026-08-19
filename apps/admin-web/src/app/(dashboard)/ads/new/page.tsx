/* Interface outline: implementation bodies removed. */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  createCampaign,
  updateCampaign,
  submitCampaign,
  getCampaign,
  getSchools,
  getPricingDefaults,
  type AdPricingModel,
  type CampaignInput,
  type PricingDefaults,
  type School,
} from '@/lib/api';
import { fenToYuan } from '@/lib/format';
import {
  PageHeader,
  Card,
  Field,
  Input,
  Textarea,
  Money,
  RoleGate,
  useAdminInfo,
  PRICING_MODEL_LABELS,
} from '@/components/ui';

type AdPricingModel,
type CampaignInput,
type PricingDefaults,
type School,
function calcDays(start: string, end: string): number;
function normalizeSchools(data: any): School[];
function CampaignForm();
  useEffect(() =>;
  getSchools(...);
  getPricingDefaults();
  useEffect(() =>;
  useEffect(() =>;
  setLoading(true);
  setTitle(c.title || '');
  setContent(c.content || '');
  setImages(c.images?.length ? c.images : ['']);
  setLandingUrl(c.landingUrl || '');
  setPricingModel(c.pricingModel || 'BUYOUT');
  setSchoolIds(c.placements?.map((p: any) => p.schoolId) || []);
  setStartDate(c.startDate ? String(c.startDate).slice(0, 10) : '');
  setEndDate(c.endDate ? String(c.endDate).slice(0, 10) : '');
  setBudgetYuan(c.budgetCents != null ? String(c.budgetCents / 100) : '');
  setLoading(false);
  setSchoolIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  setSaving(submit ? 'submit' : 'draft');
  setSaving(null);
  setImages((prev) => prev.map((u, j) => (j === i ? e.target.value : u)));
type="button"
type="button"
type="radio"
type="checkbox"
type="number"
