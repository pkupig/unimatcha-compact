'use client';

/**
 * 学校详情（SUPER/TEAM；学生会访问重定向到 /earnings）— spec §5
 * 基本信息 / 分成配置（bps ↔ %）/ 计价覆盖（元输入分存储，清空=用全局默认）/
 * 银行账户（只读 + TEAM 代改）/ 数据 StatCards。
 */

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

/** 元字符串 → 分；空串返回 null（= 清除覆盖回落默认）；非法返回 undefined */
function yuanToCents(v: string): number | null | undefined {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

/** 分 → 元输入框字符串（null/undefined → 空串） */
function centsToYuanInput(c?: number | null): string {
  return c == null ? '' : String(c / 100);
}

/** 百分数字符串（0-100）→ bps；非法返回 undefined */
function pctToBps(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!isFinite(n) || n < 0 || n > 100) return undefined;
  return Math.round(n * 100);
}

export default function SchoolDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const schoolId = params.id;

  // 页面级角色守卫：学生会 → /earnings；其他非团队 → /dashboard
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const info = getAdminInfo();
    if (!info) {
      router.replace('/login');
      return;
    }
    if (isUnion(info.role)) {
      router.replace('/earnings');
      return;
    }
    if (!isTeam(info.role)) {
      router.replace('/dashboard');
      return;
    }
    setOk(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [school, setSchool] = useState<School | null>(null);
  const [defaults, setDefaults] = useState<PricingDefaults | null>(null);
  const [loading, setLoading] = useState(true);

  // 基本信息表单
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [savingBasic, setSavingBasic] = useState(false);

  // 分成配置表单（% 字符串）
  const [platformPct, setPlatformPct] = useState('');
  const [selfPct, setSelfPct] = useState('');
  const [savingShare, setSavingShare] = useState(false);

  // 计价覆盖表单（元字符串，空 = 用全局默认）
  const [buyoutYuan, setBuyoutYuan] = useState('');
  const [cpmYuan, setCpmYuan] = useState('');
  const [cpcYuan, setCpcYuan] = useState('');
  const [savingPricing, setSavingPricing] = useState(false);

  // 银行账户 Modal（TEAM 代改）
  const [showBank, setShowBank] = useState(false);
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [savingBank, setSavingBank] = useState(false);

  useEffect(() => {
    if (!ok) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, schoolId]);

  const applySchool = (s: School) => {
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
  };

  const load = async () => {
    setLoading(true);
    try {
      const [schoolRes, defaultsRes] = await Promise.all([
        getSchool(schoolId),
        getPricingDefaults(),
      ]);
      applySchool((schoolRes as any).data);
      setDefaults((defaultsRes as any).data);
    } catch (err: any) {
      toast.error(err?.message || '学校详情加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBasic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('请填写学校名称');
      return;
    }
    setSavingBasic(true);
    try {
      const res = await updateSchool(schoolId, {
        name: name.trim(),
        city: city.trim() || null,
        isActive,
      });
      toast.success('基本信息已保存');
      applySchool({ ...(school as School), ...(res as any).data });
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingBasic(false);
    }
  };

  const handleSaveShare = async (e: React.FormEvent) => {
    e.preventDefault();
    const pBps = pctToBps(platformPct);
    const sBps = pctToBps(selfPct);
    if (pBps === undefined || sBps === undefined) {
      toast.error('分成比例须为 0-100 之间的百分数');
      return;
    }
    setSavingShare(true);
    try {
      const res = await updateSchool(schoolId, {
        platformShareBps: pBps,
        selfSourcedShareBps: sBps,
      });
      toast.success('分成配置已保存');
      applySchool({ ...(school as School), ...(res as any).data });
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingShare(false);
    }
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    const buyout = yuanToCents(buyoutYuan);
    const cpm = yuanToCents(cpmYuan);
    const cpc = yuanToCents(cpcYuan);
    if (buyout === undefined || cpm === undefined || cpc === undefined) {
      toast.error('价格须为非负数字（元），留空表示使用全局默认');
      return;
    }
    setSavingPricing(true);
    try {
      const res = await updateSchool(schoolId, {
        buyoutDailyPriceCents: buyout,
        cpmPriceCents: cpm,
        cpcPriceCents: cpc,
      });
      toast.success('计价覆盖已保存');
      applySchool({ ...(school as School), ...(res as any).data });
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingPricing(false);
    }
  };

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankAccountName.trim() || !bankName.trim() || !bankAccountNo.trim()) {
      toast.error('请完整填写户名 / 开户行 / 账号');
      return;
    }
    setSavingBank(true);
    try {
      const res = await updateSchoolBank(schoolId, {
        bankAccountName: bankAccountName.trim(),
        bankName: bankName.trim(),
        bankAccountNo: bankAccountNo.trim(),
      });
      toast.success('银行账户已更新');
      setShowBank(false);
      applySchool({ ...(school as School), ...(res as any).data });
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingBank(false);
    }
  };

  if (!ok) return null;

  if (loading || !school) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 rounded-full bg-surface-high animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-48 animate-pulse bg-surface-low" />
          ))}
        </div>
      </div>
    );
  }

  const stats = (school.stats || {}) as any;

  return (
    <div className="space-y-6">
      <PageHeader
        caption="SCHOOL DETAIL"
        title={school.name}
        sub={school.city || '—'}
        actions={
          <>
            <Badge variant={school.isActive ? 'neon' : 'pink'}>
              {school.isActive ? '启用' : '停用'}
            </Badge>
            <Link href="/schools" className="btn-secondary btn-sm">
              <ArrowLeft size={14} />
              返回列表
            </Link>
          </>
        }
      />

      {/* 数据 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="用户数 · USERS" value={formatNumber(stats.userCount)} icon={Users} />
        <StatCard
          label="进行中广告 · ACTIVE ADS"
          value={formatNumber(stats.activeCampaignCount ?? stats.activeCampaigns)}
          icon={Megaphone}
        />
        <StatCard
          label="累计收入 · REVENUE"
          value={fenToYuan(stats.totalRevenueCents)}
          icon={TrendingUp}
          accent="ink"
        />
        <StatCard
          label="余额 · BALANCE"
          value={fenToYuan(stats.balanceCents)}
          icon={Wallet}
          accent="neon"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 基本信息 */}
        <Card caption="BASIC INFO" title="基本信息">
          <form onSubmit={handleSaveBasic} className="space-y-4">
            <Field label="学校名称" required hint="须唯一，与用户资料学校字段匹配">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="城市">
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <div className="flex items-center justify-between">
              <span className="label mb-0">启用状态</span>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors ' +
                  (isActive ? 'bg-neon' : 'bg-surface-higher')
                }
                aria-label="切换启用状态"
              >
                <span
                  className={
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform ' +
                    (isActive ? 'translate-x-6' : 'translate-x-1')
                  }
                />
              </button>
            </div>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary btn-sm" disabled={savingBasic}>
                {savingBasic ? '保存中…' : '保存基本信息'}
              </button>
            </div>
          </form>
        </Card>

        {/* 分成配置 */}
        <Card caption="REVENUE SHARE" title="分成配置">
          <form onSubmit={handleSaveShare} className="space-y-4">
            <Field
              label="平台直签分成 %"
              required
              hint="平台直签商家广告给学校的分成比例（0-100%，默认 10%）"
            >
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  className="font-mono pr-8"
                  value={platformPct}
                  onChange={(e) => setPlatformPct(e.target.value)}
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-outline font-mono text-sm">
                  %
                </span>
              </div>
            </Field>
            <Field
              label="自拉赞助分成 %"
              required
              hint="学生会自拉商家广告给学校的分成比例（0-100%，默认 30%）"
            >
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  className="font-mono pr-8"
                  value={selfPct}
                  onChange={(e) => setSelfPct(e.target.value)}
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-outline font-mono text-sm">
                  %
                </span>
              </div>
            </Field>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary btn-sm" disabled={savingShare}>
                {savingShare ? '保存中…' : '保存分成配置'}
              </button>
            </div>
          </form>
        </Card>

        {/* 计价覆盖 */}
        <Card
          caption="PRICING OVERRIDE"
          title="计价覆盖"
          actions={<span className="caption text-outline">留空 = 用全局默认</span>}
        >
          <form onSubmit={handleSavePricing} className="space-y-4">
            <Field
              label="包断日价（元/天·校）"
              hint={`全局默认 ${fenToYuan(defaults?.buyoutDailyPriceCents)} / 天·校`}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                className="font-mono"
                placeholder="留空使用默认"
                value={buyoutYuan}
                onChange={(e) => setBuyoutYuan(e.target.value)}
              />
            </Field>
            <Field
              label="CPM 单价（元/千次曝光）"
              hint={`全局默认 ${fenToYuan(defaults?.cpmPriceCents)} / 千次曝光`}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                className="font-mono"
                placeholder="留空使用默认"
                value={cpmYuan}
                onChange={(e) => setCpmYuan(e.target.value)}
              />
            </Field>
            <Field
              label="CPC 单价（元/次点击）"
              hint={`全局默认 ${fenToYuan(defaults?.cpcPriceCents)} / 次点击`}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                className="font-mono"
                placeholder="留空使用默认"
                value={cpcYuan}
                onChange={(e) => setCpcYuan(e.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary btn-sm" disabled={savingPricing}>
                {savingPricing ? '保存中…' : '保存计价覆盖'}
              </button>
            </div>
          </form>
        </Card>

        {/* 银行账户 */}
        <Card
          caption="BANK ACCOUNT"
          title="银行账户"
          actions={
            <button className="btn-secondary btn-sm" onClick={() => setShowBank(true)}>
              <Pencil size={14} />
              代为修改
            </button>
          }
        >
          {school.bankAccountName || school.bankName || school.bankAccountNo ? (
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="caption">户名</dt>
                <dd className="text-on-surface font-semibold">{school.bankAccountName || '-'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="caption">开户行</dt>
                <dd className="text-on-surface">{school.bankName || '-'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="caption">账号</dt>
                <dd className="font-mono text-on-surface">{school.bankAccountNo || '-'}</dd>
              </div>
            </dl>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="w-10 h-10 rounded-full bg-surface-low flex items-center justify-center mb-2">
                <Landmark size={18} className="text-outline" />
              </div>
              <p className="text-sm text-on-surface-variant">
                尚未绑定银行账户（学生会可在收益提现页自助绑定）
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* 银行账户编辑 Modal */}
      <Modal
        open={showBank}
        onClose={() => setShowBank(false)}
        caption="BANK ACCOUNT"
        title="修改银行账户"
      >
        <form onSubmit={handleSaveBank} className="space-y-4">
          <Field label="户名" required>
            <Input
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value)}
              placeholder="例如 Warwick 学生会"
              required
            />
          </Field>
          <Field label="开户行" required>
            <Input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="例如 中国银行"
              required
            />
          </Field>
          <Field label="银行账号" required>
            <Input
              className="font-mono"
              value={bankAccountNo}
              onChange={(e) => setBankAccountNo(e.target.value)}
              placeholder="账号数字"
              required
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowBank(false)}>
              取消
            </button>
            <button type="submit" className="btn-primary" disabled={savingBank}>
              {savingBank ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
