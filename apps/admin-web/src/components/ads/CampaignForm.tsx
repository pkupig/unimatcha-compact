'use client';

/**
 * 商家创建/编辑广告表单（ADSN-1..8）：
 * - ?id= 编辑模式仅 DRAFT/REJECTED，否则 toast + 跳详情
 * - 双动作：存草稿 / 提交审核（先 create-or-update 再 submit）
 * - 自拉商家锁定本校；右侧 QuotePanel 实时报价
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Field, Input, Textarea } from '@/components/ui/form';
import { useAdmin } from '@/lib/auth-context';
import { getCampaign, createCampaign, updateCampaign, submitCampaign } from '@/lib/api/ads';
import { listSchools } from '@/lib/api/schools';
import { toastError } from '@/lib/toast';
import { toDateInput } from '@/lib/format';
import type { CampaignInput, PricingModel, SponsorSchool } from '@/lib/types';
import { EnergyBalanceBanner } from './EnergyBalanceBanner';
import { ImageUrlListInput } from './ImageUrlListInput';
import { PricingModelPicker } from './PricingModelPicker';
import { QuotePanel } from './QuotePanel';
import { SchoolPicker } from './SchoolPicker';

/** 起止均含当天：2026-07-01 ~ 2026-07-03 = 3 天 */
function calcDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

export function CampaignForm() {
  const router = useRouter();
  const editId = useSearchParams().get('id');
  const { admin } = useAdmin();
  /** 自拉商家：锁定到来源学校（ADSN-5） */
  const lockedSchoolId = admin?.sourcedBySchoolId ?? null;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>(['']);
  const [landingUrl, setLandingUrl] = useState('');
  const [pricingModel, setPricingModel] = useState<PricingModel>('BUYOUT');
  const [schoolIds, setSchoolIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // 能量经济：预算即能量数（≡ budgetCents 原值），正整数输入，无元↔分换算
  const [budgetEnergy, setBudgetEnergy] = useState('');

  const [schools, setSchools] = useState<SponsorSchool[]>([]);
  const [loading, setLoading] = useState(!!editId);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);

  useEffect(() => {
    // 商家视角的 listSchools 只返回启用学校且附 effectivePrices（后端 limit 封顶 100）
    listSchools({ page: 1, limit: 100 })
      .then((res) => setSchools(res.items))
      .catch((e) => toastError(e, '加载学校列表失败'));
  }, []);

  // 自拉商家：强制只投本校
  useEffect(() => {
    if (lockedSchoolId) setSchoolIds([lockedSchoolId]);
  }, [lockedSchoolId]);

  // 编辑模式回填（仅 DRAFT/REJECTED 可编辑，其余跳详情）
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const c = await getCampaign(editId);
        if (cancelled) return;
        if (c.status !== 'DRAFT' && c.status !== 'REJECTED') {
          toast.error('仅草稿或已驳回的广告可编辑');
          router.replace(`/ads/${editId}`);
          return;
        }
        setTitle(c.title);
        setContent(c.content);
        setImages(c.images.length ? c.images : ['']);
        setLandingUrl(c.landingUrl ?? '');
        setPricingModel(c.pricingModel);
        setSchoolIds(c.placements.map((p) => p.schoolId));
        setStartDate(toDateInput(c.startDate));
        setEndDate(toDateInput(c.endDate));
        setBudgetEnergy(c.budgetCents != null ? String(c.budgetCents) : '');
      } catch (e) {
        if (cancelled) return;
        toastError(e, '加载广告失败');
        router.replace('/ads');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, router]);

  const days = calcDays(startDate, endDate);
  const selectedSchools = useMemo(
    () => schools.filter((s) => schoolIds.includes(s.id)),
    [schools, schoolIds],
  );
  // 正整数能量通过，空/非法为 null（buildPayload 拦截并提示）
  const budgetCents = useMemo(() => {
    const t = budgetEnergy.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [budgetEnergy]);

  const toggleSchool = (id: string) => {
    if (lockedSchoolId) return;
    setSchoolIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  /** 校验通过返回载荷，否则 toast 并返回 null（BUYOUT 不带 budgetCents，空 landingUrl 省略） */
  const buildPayload = (): CampaignInput | null => {
    const imgs = images.map((u) => u.trim()).filter(Boolean);
    const fail = (msg: string) => {
      toast.error(msg);
      return null;
    };
    if (!title.trim()) return fail('请填写标题');
    if (!content.trim()) return fail('请填写文案');
    if (imgs.length === 0) return fail('至少填写 1 个图片 URL');
    if (schoolIds.length === 0) return fail('请选择至少 1 所投放学校');
    if (!startDate || !endDate) return fail('请选择投放起止日期');
    if (days <= 0) return fail('结束日期不能早于开始日期');
    if (pricingModel !== 'BUYOUT' && budgetCents == null) {
      return fail('CPM / CPC 模式需填写正整数能量预算');
    }
    const trimmedLanding = landingUrl.trim();
    return {
      title: title.trim(),
      content: content.trim(),
      images: imgs,
      ...(trimmedLanding ? { landingUrl: trimmedLanding } : {}),
      pricingModel,
      startDate,
      endDate,
      ...(pricingModel !== 'BUYOUT' && budgetCents != null ? { budgetCents } : {}),
      schoolIds,
    };
  };

  const handleSave = async (submit: boolean) => {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(submit ? 'submit' : 'draft');
    let savedId: string | null = null;
    try {
      const saved = editId ? await updateCampaign(editId, payload) : await createCampaign(payload);
      savedId = saved.id;
      if (submit) await submitCampaign(saved.id);
      toast.success(submit ? '已提交审核' : '草稿已保存');
      router.push(`/ads/${saved.id}`);
    } catch (e) {
      // 后端提交预扣 400「能量不足，请先充值」→ 附充值引导（横条同时可见）
      if (e instanceof Error && e.message.includes('能量不足')) {
        toast.error('能量不足，请先前往「能量钱包」充值后再提交审核');
      } else {
        toastError(e);
      }
      // create 成功但 submit 失败：切入编辑模式复用已建草稿，重试不再重复建单
      if (savedId && !editId) {
        router.replace(`/ads/new?id=${savedId}`);
      }
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <>
        <div className="h-8 w-48 rounded-lg bg-surface-high animate-pulse" />
        <div className="card h-72 animate-pulse" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        caption={editId ? 'EDIT CAMPAIGN' : 'NEW CAMPAIGN'}
        title={editId ? '编辑广告' : '新建广告'}
        sub="填写素材与排期，右侧实时预览报价"
        actions={
          <Link href={editId ? `/ads/${editId}` : '/ads'} className="btn-secondary btn-sm">
            <ArrowLeft size={14} />
            返回
          </Link>
        }
      />

      <EnergyBalanceBanner
        pricingModel={pricingModel}
        days={days}
        selectedSchools={selectedSchools}
        budgetCents={budgetCents}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-5">
          <Card caption="CREATIVE" title="广告素材">
            <div className="space-y-5">
              <Field label="标题" required>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="广告卡片标题（H5 大卡展示）"
                  maxLength={60}
                />
              </Field>
              <Field label="文案" required>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="广告卡片文案"
                  rows={4}
                  maxLength={2000}
                />
              </Field>
              <Field label="图片 URLs" required hint="至少 1 张，H5 大卡展示，建议横图">
                <ImageUrlListInput value={images} onChange={setImages} />
              </Field>
              <Field label="落地链接" hint="可选；点击卡片跳转的外链，留空则仅展示详情">
                <Input
                  value={landingUrl}
                  onChange={(e) => setLandingUrl(e.target.value)}
                  placeholder="https://…（可选）"
                  maxLength={500}
                />
              </Field>
            </div>
          </Card>

          <Card caption="PRICING" title="计价模式">
            <PricingModelPicker value={pricingModel} onChange={setPricingModel} />
          </Card>

          <Card caption="PLACEMENT" title="投放学校">
            <SchoolPicker
              schools={schools}
              selected={schoolIds}
              onToggle={toggleSchool}
              pricingModel={pricingModel}
              lockedSchoolId={lockedSchoolId}
            />
          </Card>

          <Card caption="SCHEDULE & BUDGET" title="档期与预算">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="开始日期" required>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field label="结束日期" required hint={days > 0 ? `共 ${days} 天（含首尾）` : undefined}>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
              {pricingModel !== 'BUYOUT' && (
                <div className="sm:col-span-2">
                  <Field label="预算（能量）" required hint="正整数；消耗达到预算后自动停止投放，结算结余原路退回">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={budgetEnergy}
                      onChange={(e) => setBudgetEnergy(e.target.value)}
                      placeholder="如 500000"
                      className="font-mono"
                    />
                  </Field>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-6 space-y-4">
          <QuotePanel
            pricingModel={pricingModel}
            days={days}
            selectedSchools={selectedSchools}
            budgetCents={budgetCents}
          />
          <div className="flex flex-col gap-2">
            <Button
              variant="cta"
              loading={saving === 'submit'}
              disabled={saving != null}
              onClick={() => void handleSave(true)}
            >
              提交审核
            </Button>
            <Button
              variant="primary"
              loading={saving === 'draft'}
              disabled={saving != null}
              onClick={() => void handleSave(false)}
            >
              存草稿
            </Button>
            <p className="text-xs text-outline text-center">
              提交后计价按平台快照锁定并预扣能量，审核期间不可编辑
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
