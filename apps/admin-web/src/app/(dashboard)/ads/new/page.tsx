'use client';

/**
 * /ads/new — 创建 / 编辑广告（SPONSOR 专属）
 * 编辑模式：/ads/new?id=<campaignId>（仅 DRAFT / REJECTED 可编辑）
 * 右侧实时报价：BUYOUT = 天数 × 各校日单价合计（School 覆盖价 → 全局默认价 → 待核价）；
 *              CPM/CPC = 预算即消耗封顶。
 */

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

const EDITABLE_STATUSES = ['DRAFT', 'REJECTED'];

const PRICING_OPTIONS: { value: AdPricingModel; label: string; desc: string }[] = [
  { value: 'BUYOUT', label: PRICING_MODEL_LABELS.BUYOUT, desc: '按天按校固定价，档期内包断展示' },
  { value: 'CPM', label: PRICING_MODEL_LABELS.CPM, desc: '每 1000 次曝光计费，预算即封顶' },
  { value: 'CPC', label: PRICING_MODEL_LABELS.CPC, desc: '按每次点击计费，预算即封顶' },
];

/** 起止均含当天：2026-07-01 ~ 2026-07-03 = 3 天 */
function calcDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

function normalizeSchools(data: any): School[] {
  const list: any[] = Array.isArray(data) ? data : data?.schools || data?.items || data?.list || [];
  // 商家角色的瘦身响应把生效单价放在 effectivePrices（已合并全局默认），铺平到顶层供报价直接用
  return list.map((s) =>
    s?.effectivePrices
      ? {
          ...s,
          buyoutDailyPriceCents: s.effectivePrices.buyoutDailyPriceCents,
          cpmPriceCents: s.effectivePrices.cpmPriceCents,
          cpcPriceCents: s.effectivePrices.cpcPriceCents,
        }
      : s,
  );
}

function CampaignForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');
  const admin = useAdminInfo();

  /* ── 表单状态 ── */
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>(['']);
  const [landingUrl, setLandingUrl] = useState('');
  const [pricingModel, setPricingModel] = useState<AdPricingModel>('BUYOUT');
  const [schoolIds, setSchoolIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budgetYuan, setBudgetYuan] = useState('');

  /* ── 数据 ── */
  const [schools, setSchools] = useState<School[]>([]);
  const [defaults, setDefaults] = useState<PricingDefaults | null>(null);
  const [loading, setLoading] = useState(!!editId);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);

  /** 自拉商家：锁定到来源学校 */
  const lockedSchoolId = admin?.sourcedBySchoolId || null;

  useEffect(() => {
    getSchools({ isActive: true, limit: 500 })
      .then((res) => setSchools(normalizeSchools((res as any).data)))
      .catch(() => toast.error('加载学校列表失败'));
    // 全局计价默认值（后端可能仅对团队开放，失败则静默降级为「待核价」）
    getPricingDefaults()
      .then((res) => setDefaults((res as any).data || null))
      .catch(() => {});
  }, []);

  // 自拉商家：强制只投本校
  useEffect(() => {
    if (lockedSchoolId) setSchoolIds([lockedSchoolId]);
  }, [lockedSchoolId]);

  // 编辑模式：回填表单
  useEffect(() => {
    if (!editId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await getCampaign(editId);
        const c = (res as any).data;
        if (!c) throw new Error('广告不存在');
        if (!EDITABLE_STATUSES.includes(c.status)) {
          toast.error('仅草稿或已驳回的广告可编辑');
          router.replace(`/ads/${editId}`);
          return;
        }
        setTitle(c.title || '');
        setContent(c.content || '');
        setImages(c.images?.length ? c.images : ['']);
        setLandingUrl(c.landingUrl || '');
        setPricingModel(c.pricingModel || 'BUYOUT');
        setSchoolIds(c.placements?.map((p: any) => p.schoolId) || []);
        setStartDate(c.startDate ? String(c.startDate).slice(0, 10) : '');
        setEndDate(c.endDate ? String(c.endDate).slice(0, 10) : '');
        setBudgetYuan(c.budgetCents != null ? String(c.budgetCents / 100) : '');
      } catch (err: any) {
        toast.error(err?.message || '加载广告失败');
        router.replace('/ads');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const toggleSchool = (id: string) => {
    if (lockedSchoolId) return;
    setSchoolIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  /* ── 实时报价 ── */
  const days = calcDays(startDate, endDate);
  const selectedSchools = useMemo(
    () => schools.filter((s) => schoolIds.includes(s.id)),
    [schools, schoolIds],
  );
  const budgetCents = budgetYuan ? Math.round(Number(budgetYuan) * 100) : 0;

  /** BUYOUT：每校 { school, daily: 单价 | null }，null = 未知需平台核价 */
  const buyoutLines = useMemo(
    () =>
      selectedSchools.map((s) => ({
        school: s,
        daily: s.buyoutDailyPriceCents ?? defaults?.buyoutDailyPriceCents ?? null,
      })),
    [selectedSchools, defaults],
  );
  const buyoutKnownTotal = buyoutLines.reduce(
    (sum, l) => sum + (l.daily != null ? l.daily * days : 0),
    0,
  );
  const buyoutHasUnknown = buyoutLines.some((l) => l.daily == null);

  /* ── 保存 / 提交 ── */
  const buildPayload = (): CampaignInput | null => {
    const imgs = images.map((u) => u.trim()).filter(Boolean);
    if (!title.trim()) return toast.error('请填写标题'), null;
    if (!content.trim()) return toast.error('请填写文案'), null;
    if (imgs.length === 0) return toast.error('至少填写 1 个图片 URL'), null;
    if (schoolIds.length === 0) return toast.error('请选择至少 1 所投放学校'), null;
    if (!startDate || !endDate) return toast.error('请选择投放起止日期'), null;
    if (days <= 0) return toast.error('结束日期不能早于开始日期'), null;
    if (pricingModel !== 'BUYOUT' && (!budgetYuan || budgetCents <= 0))
      return toast.error('CPM / CPC 模式需填写预算'), null;
    return {
      title: title.trim(),
      content: content.trim(),
      images: imgs,
      landingUrl: landingUrl.trim() || null,
      pricingModel,
      startDate,
      endDate,
      budgetCents: pricingModel === 'BUYOUT' ? null : budgetCents,
      schoolIds,
    };
  };

  const handleSave = async (submit: boolean) => {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(submit ? 'submit' : 'draft');
    try {
      let campaignId = editId;
      if (editId) {
        await updateCampaign(editId, payload);
      } else {
        const res = await createCampaign(payload);
        const d = (res as any).data;
        campaignId = d?.id || d?.campaign?.id || null;
      }
      if (submit) {
        if (!campaignId) throw new Error('创建成功但未返回广告 ID，请到列表中手动提交');
        await submitCampaign(campaignId);
      }
      toast.success(submit ? '已提交审核' : '草稿已保存');
      router.push(campaignId ? `/ads/${campaignId}` : '/ads');
    } catch (err: any) {
      toast.error(err?.message || (submit ? '提交失败' : '保存失败'));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded-lg bg-surface-high animate-pulse" />
        <div className="card h-72 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* ── 左：表单 ── */}
        <div className="lg:col-span-2 space-y-6">
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
                />
              </Field>
              <Field label="图片 URLs" required hint="至少 1 张，H5 大卡展示，建议横图">
                <div className="space-y-2">
                  {images.map((url, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={url}
                        onChange={(e) =>
                          setImages((prev) => prev.map((u, j) => (j === i ? e.target.value : u)))
                        }
                        placeholder="https://…"
                      />
                      {images.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                          className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-low hover:text-neon-pink transition-colors shrink-0"
                          aria-label="删除图片"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setImages((prev) => [...prev, ''])}
                    className="btn-secondary btn-sm"
                  >
                    <Plus size={14} />
                    添加图片
                  </button>
                </div>
              </Field>
              <Field label="落地链接" hint="可选；点击卡片跳转的外链，留空则仅展示详情">
                <Input
                  value={landingUrl}
                  onChange={(e) => setLandingUrl(e.target.value)}
                  placeholder="https://…（可选）"
                />
              </Field>
            </div>
          </Card>

          <Card caption="PRICING" title="计价模式">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PRICING_OPTIONS.map((opt) => {
                const active = pricingModel === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={clsx(
                      'flex flex-col gap-1 rounded-lg border p-4 cursor-pointer transition-all',
                      active
                        ? 'border-ink bg-surface-low ring-1 ring-ink'
                        : 'border-outline-variant/60 hover:border-outline',
                    )}
                  >
                    <input
                      type="radio"
                      name="pricingModel"
                      className="sr-only"
                      checked={active}
                      onChange={() => setPricingModel(opt.value)}
                    />
                    <span className="flex items-center gap-2">
                      <span
                        className={clsx(
                          'w-3.5 h-3.5 rounded-full border-2 shrink-0',
                          active ? 'border-ink bg-ink' : 'border-outline-variant bg-white',
                        )}
                      />
                      <span className="font-display font-bold text-sm text-on-surface">
                        {opt.label}
                      </span>
                    </span>
                    <span className="text-xs text-on-surface-variant leading-relaxed pl-[22px]">
                      {opt.desc}
                    </span>
                  </label>
                );
              })}
            </div>
          </Card>

          <Card caption="PLACEMENT" title="投放学校">
            {lockedSchoolId ? (
              <div>
                {(() => {
                  const locked = schools.find((s) => s.id === lockedSchoolId);
                  return (
                    <label className="flex items-center gap-3 rounded-lg border border-ink bg-surface-low p-4">
                      <input type="checkbox" checked disabled className="accent-black" />
                      <span className="font-display font-bold text-sm text-on-surface">
                        {locked?.name || '本校'}
                      </span>
                    </label>
                  );
                })()}
                <p className="text-xs text-outline mt-2">自拉赞助商仅可投放本校</p>
              </div>
            ) : schools.length === 0 ? (
              <p className="text-sm text-on-surface-variant">暂无可投放学校</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {schools.map((s) => {
                  const checked = schoolIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={clsx(
                        'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all',
                        checked
                          ? 'border-ink bg-surface-low'
                          : 'border-outline-variant/60 hover:border-outline',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSchool(s.id)}
                        className="accent-black"
                      />
                      <span className="text-sm font-medium text-on-surface flex-1">{s.name}</span>
                      {pricingModel === 'BUYOUT' && (
                        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
                          {s.buyoutDailyPriceCents != null
                            ? `${fenToYuan(s.buyoutDailyPriceCents)}/天`
                            : defaults?.buyoutDailyPriceCents != null
                              ? `${fenToYuan(defaults.buyoutDailyPriceCents)}/天`
                              : '待核价'}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
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
                <Field
                  label="预算（元）"
                  required
                  hint="消耗达到预算后自动停止投放"
                  className="sm:col-span-2"
                >
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={budgetYuan}
                    onChange={(e) => setBudgetYuan(e.target.value)}
                    placeholder="如 5000"
                    className="font-mono"
                  />
                </Field>
              )}
            </div>
          </Card>
        </div>

        {/* ── 右：实时报价 ── */}
        <div className="lg:sticky lg:top-6 space-y-4">
          <Card caption="QUOTE" title="实时报价">
            {pricingModel === 'BUYOUT' ? (
              <div className="space-y-3">
                {selectedSchools.length === 0 || days <= 0 ? (
                  <p className="text-sm text-on-surface-variant">选择投放学校与起止日期后自动估价</p>
                ) : (
                  <>
                    <ul className="space-y-2">
                      {buyoutLines.map((l) => (
                        <li
                          key={l.school.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="text-on-surface-variant truncate">{l.school.name}</span>
                          <span className="font-mono text-xs text-on-surface whitespace-nowrap">
                            {l.daily != null
                              ? `${fenToYuan(l.daily)} × ${days}天`
                              : '待核价'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="border-t border-outline-variant/40 pt-3">
                      <p className="caption mb-1">预估总价</p>
                      {buyoutHasUnknown && buyoutKnownTotal === 0 ? (
                        <p className="text-sm text-on-surface-variant">提交后以平台核价为准</p>
                      ) : (
                        <>
                          <Money
                            cents={buyoutKnownTotal}
                            className="text-2xl font-bold text-on-surface"
                          />
                          {buyoutHasUnknown && (
                            <p className="text-xs text-outline mt-1">
                              部分学校未配置单价，提交后以平台核价为准
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="caption mb-1">预算封顶</p>
                  <Money cents={budgetCents} className="text-2xl font-bold text-on-surface" />
                  <p className="text-xs text-outline mt-1">
                    {pricingModel === 'CPM'
                      ? '按每 1000 次曝光计费，消耗达预算即停'
                      : '按每次点击计费，消耗达预算即停'}
                  </p>
                </div>
                {selectedSchools.length > 0 && (
                  <ul className="space-y-2 border-t border-outline-variant/40 pt-3">
                    {selectedSchools.map((s) => {
                      const unit =
                        pricingModel === 'CPM'
                          ? (s.cpmPriceCents ?? defaults?.cpmPriceCents ?? null)
                          : (s.cpcPriceCents ?? defaults?.cpcPriceCents ?? null);
                      return (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="text-on-surface-variant truncate">{s.name}</span>
                          <span className="font-mono text-xs text-on-surface whitespace-nowrap">
                            {unit != null
                              ? `${fenToYuan(unit)}/${pricingModel === 'CPM' ? '千次曝光' : '点击'}`
                              : '待核价'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </Card>

          <div className="flex flex-col gap-2">
            <button
              className="btn-cta w-full"
              disabled={saving != null}
              onClick={() => handleSave(true)}
            >
              {saving === 'submit' ? '提交中…' : '提交审核'}
            </button>
            <button
              className="btn-primary w-full"
              disabled={saving != null}
              onClick={() => handleSave(false)}
            >
              {saving === 'draft' ? '保存中…' : '存草稿'}
            </button>
            <p className="text-xs text-outline text-center">
              提交后计价将按平台快照锁定，审核期间不可编辑
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewAdPage() {
  return (
    <RoleGate allow={['SPONSOR']}>
      <Suspense fallback={null}>
        <CampaignForm />
      </Suspense>
    </RoleGate>
  );
}
