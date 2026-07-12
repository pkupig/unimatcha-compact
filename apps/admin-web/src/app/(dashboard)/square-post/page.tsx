'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Send, Megaphone, Plus, X, ShieldAlert } from 'lucide-react';
import { createOfficialPost } from '@/lib/api';
import { getAdminInfo, type AdminRole } from '@/lib/auth';
import {
  PageHeader,
  Card,
  Badge,
  EmptyState,
  Field,
  Input,
  Textarea,
  RoleGate,
} from '@/components/ui';

type AuthorType = 'STUDENT_UNION' | 'TEAM' | 'SPONSOR';

const AUTHOR_TYPE_LABELS: Record<AuthorType, string> = {
  STUDENT_UNION: '学生会',
  TEAM: '平台团队',
  SPONSOR: '商家',
};

const BOARD_OPTIONS: { value: 'recommend' | 'campus_wall'; label: string; desc: string }[] = [
  { value: 'recommend', label: '推荐流', desc: '出现在广场推荐流（混排进首页）' },
  { value: 'campus_wall', label: '校园墙', desc: '本校用户可见的校园墙' },
];

function SquarePostInner() {
  const [admin, setAdmin] = useState<any>(null);

  const [board, setBoard] = useState<'recommend' | 'campus_wall'>('recommend');
  const [school, setSchool] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [imageInput, setImageInput] = useState('');
  const [isSponsored, setIsSponsored] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const info = getAdminInfo();
    setAdmin(info);
    // 按绑定 role 推导：SUPER 不直接发官方帖（后端拒绝），仅 STUDENT_UNION/TEAM/SPONSOR 可发
    const role: AdminRole | null = info?.role || null;
    if (role === 'STUDENT_UNION') {
      // schoolId 已迁移为 School.id（cuid），发帖用学校名 —— 优先取后端冗余的 schoolName
      setSchool(info?.schoolName || info?.schoolId || '');
    }
    if (role === 'SPONSOR') {
      setIsSponsored(true);
    }
  }, []);

  const role: AdminRole | null = admin?.role || null;

  // authorType 由当前后管 role 推导锁定（STUDENT_UNION/TEAM/SPONSOR）
  const authorType: AuthorType =
    role === 'STUDENT_UNION' ? 'STUDENT_UNION'
    : role === 'SPONSOR' ? 'SPONSOR'
    : 'TEAM';

  // STUDENT_UNION 锁定本校；SPONSOR 强制 Sponsored
  const schoolLocked = role === 'STUDENT_UNION';
  const sponsorForced = role === 'SPONSOR';
  // 对齐后端契约：仅 STUDENT_UNION/TEAM/SPONSOR 且账号激活才可发官方帖；SUPER 不直接发帖
  const canPublish =
    (role === 'STUDENT_UNION' || role === 'TEAM' || role === 'SPONSOR') &&
    admin?.isActive !== false;

  const addImage = () => {
    const url = imageInput.trim();
    if (!url) return;
    if (images.includes(url)) { toast.error('该图片已添加'); return; }
    setImages([...images, url]);
    setImageInput('');
  };

  const removeImage = (url: string) => setImages(images.filter((i) => i !== url));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) { toast.error('正文不能为空'); return; }
    if (authorType === 'STUDENT_UNION' && !school.trim()) {
      toast.error('学生会发帖必须指定学校');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        board,
        authorType,
        content: content.trim(),
        isSponsored: sponsorForced ? true : isSponsored,
      };
      if (title.trim()) payload.title = title.trim();
      if (school.trim()) payload.school = school.trim();
      if (images.length) payload.images = images;

      await createOfficialPost(payload);
      toast.success('官方帖已发布');
      // 重置可编辑字段（保留锁定项）
      setTitle('');
      setContent('');
      setImages([]);
      setImageInput('');
      if (!schoolLocked) setSchool('');
      if (!sponsorForced) setIsSponsored(false);
    } catch (err: any) {
      toast.error(err?.message || '发布失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        caption="SQUARE POST"
        title="官方发帖"
        sub="以官方身份发布到广场推荐流或校园墙"
      />

      {!canPublish ? (
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="该账号暂无官方发帖权限"
            sub="需要学生会 / 平台团队 / 商家角色且账号处于启用状态。"
          />
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-5">
          {/* 作者身份（锁定） */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-low border border-outline-variant/40">
            <div className="w-9 h-9 bg-ink rounded-lg flex items-center justify-center shrink-0">
              <Megaphone size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface">
                以「{AUTHOR_TYPE_LABELS[authorType]}」身份发布
              </p>
              <p className="text-xs text-on-surface-variant truncate">
                {admin?.name}{admin?.organizationName ? ` · ${admin.organizationName}` : ''}
              </p>
            </div>
            <Badge variant="ink" className="shrink-0">{authorType}</Badge>
          </div>

          {/* Board */}
          <div>
            <span className="label">发布板块</span>
            <div className="grid grid-cols-2 gap-3">
              {BOARD_OPTIONS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setBoard(b.value)}
                  className={clsx(
                    'text-left p-3 rounded-lg border transition-colors',
                    board === b.value
                      ? 'border-ink bg-surface-low'
                      : 'border-outline-variant/60 hover:bg-surface-low',
                  )}
                >
                  <p className={clsx('text-sm font-bold font-display', board === b.value ? 'text-ink' : 'text-on-surface')}>
                    {b.label}
                  </p>
                  <p className="text-xs text-outline mt-0.5">{b.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* School */}
          <Field
            label={
              <>
                学校标签
                {authorType !== 'STUDENT_UNION' && (
                  <span className="text-outline normal-case tracking-normal font-normal">（可选，跨校）</span>
                )}
              </>
            }
            required={authorType === 'STUDENT_UNION'}
            hint={schoolLocked ? '学生会账号锁定为绑定学校' : undefined}
          >
            <Input
              type="text"
              placeholder={schoolLocked ? '' : '例如：University of Warwick（留空为跨校）'}
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              disabled={schoolLocked}
              required={authorType === 'STUDENT_UNION'}
            />
          </Field>

          {/* Title */}
          <Field
            label={
              <>
                标题
                <span className="text-outline normal-case tracking-normal font-normal">（可选）</span>
              </>
            }
          >
            <Input
              type="text"
              placeholder="例如：校园活动预告"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          {/* Content */}
          <div>
            <span className="label">正文</span>
            <Textarea
              className="min-h-[120px]"
              placeholder="输入正文内容…"
              value={content}
              maxLength={2000}
              onChange={(e) => setContent(e.target.value)}
              required
            />
            <p className="text-xs text-outline mt-1 text-right font-mono">{content.length}/2000</p>
          </div>

          {/* Images */}
          <div>
            <span className="label">
              图片 URL
              <span className="text-outline normal-case tracking-normal font-normal">（可选）</span>
            </span>
            <div className="flex gap-2">
              <Input
                type="url"
                className="flex-1"
                placeholder="https://..."
                value={imageInput}
                onChange={(e) => setImageInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addImage(); } }}
              />
              <button type="button" onClick={addImage} className="btn-secondary shrink-0">
                <Plus size={15} /> 添加
              </button>
            </div>
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {images.map((url) => (
                  <div key={url} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="w-20 h-20 object-cover rounded-lg border border-outline-variant/60"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(url)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-neon-pink text-white rounded-full flex items-center justify-center shadow-sm"
                      title="移除"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sponsored */}
          <div className="flex items-center justify-between">
            <div>
              <span className="label mb-0">标记为赞助内容</span>
              <p className="text-xs text-outline mt-0.5">
                {sponsorForced ? '商家帖子始终标记为赞助' : '商业推广类帖子请勾选'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => !sponsorForced && setIsSponsored(!isSponsored)}
              disabled={sponsorForced}
              className={clsx(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                (sponsorForced || isSponsored) ? 'bg-neon' : 'bg-surface-higher',
                sponsorForced && 'opacity-60 cursor-not-allowed',
              )}
            >
              <span
                className={clsx(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  (sponsorForced || isSponsored) ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={submitting} className="btn-cta">
              <Send size={16} /> {submitting ? '发布中…' : '发布官方帖'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function SquarePostPage() {
  // 四种角色均可进入页面；SUPER 会看到页内「无发帖权限」提示（对齐后端契约，不整页跳转）
  return (
    <RoleGate allow={['SUPER', 'TEAM', 'STUDENT_UNION', 'SPONSOR']}>
      <SquarePostInner />
    </RoleGate>
  );
}
