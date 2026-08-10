'use client';

/**
 * 官方发帖表单（SQP-2..6）：authorType 由登录角色推导展示（后端同样推导，DTO 不收该字段）。
 * 学生会锁定本校必填；商家强制 Sponsored；提交成功重置可编辑字段、保留锁定项。
 */
import { useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Megaphone, Plus, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Switch } from '@/components/ui/Switch';
import { Field, Input, Textarea } from '@/components/ui/form';
import { createOfficialPost } from '@/lib/api/moderation';
import { AUTHOR_TYPE, labelOf } from '@/lib/labels';
import { toastError } from '@/lib/toast';
import type { AdminInfo } from '@/lib/types';

type OfficialBoard = 'recommend' | 'campus_wall';

const BOARD_OPTIONS: { value: OfficialBoard; label: string; desc: string }[] = [
  { value: 'recommend', label: '推荐流', desc: '混排进广场推荐流（官方大卡）' },
  { value: 'campus_wall', label: '校园墙', desc: '本校用户可见的校园墙' },
];

export function OfficialPostForm({ admin }: { admin: AdminInfo }) {
  // 页面已保证 role ∈ TEAM/STUDENT_UNION/SPONSOR；authorType 与后端推导口径一致
  const authorType =
    admin.role === 'STUDENT_UNION' ? 'STUDENT_UNION' : admin.role === 'SPONSOR' ? 'SPONSOR' : 'TEAM';
  const schoolLocked = authorType === 'STUDENT_UNION';
  const sponsorForced = authorType === 'SPONSOR';

  const [board, setBoard] = useState<OfficialBoard>('recommend');
  // 学生会锁定为绑定学校名（post.school 存学校名，schoolId 是 cuid 不可用）
  const [school, setSchool] = useState(schoolLocked ? (admin.schoolName ?? '') : '');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [imageInput, setImageInput] = useState('');
  const [isSponsored, setIsSponsored] = useState(sponsorForced);
  const [submitting, setSubmitting] = useState(false);

  const addImage = () => {
    const url = imageInput.trim();
    if (!url) return;
    if (images.includes(url)) {
      toast.error('该图片已添加');
      return;
    }
    setImages([...images, url]);
    setImageInput('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error('正文不能为空');
      return;
    }
    if (schoolLocked && !school.trim()) {
      toast.error('学生会发帖必须指定学校');
      return;
    }
    // 校园墙按学校分流，无校帖会静默消失在所有校墙（与活动发布同口径预拦）
    if (board === 'campus_wall' && !school.trim()) {
      toast.error('校园墙帖必须指定学校');
      return;
    }
    setSubmitting(true);
    try {
      await createOfficialPost({
        board,
        content: content.trim(),
        isSponsored: sponsorForced ? true : isSponsored,
        title: title.trim() || undefined,
        school: school.trim() || undefined,
        images: images.length ? images : undefined,
      });
      toast.success('官方帖已发布');
      // 重置可编辑字段，保留锁定项（本校 / 商家 Sponsored）
      setTitle('');
      setContent('');
      setImages([]);
      setImageInput('');
      if (!schoolLocked) setSchool('');
      if (!sponsorForced) setIsSponsored(false);
    } catch (err) {
      toastError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="card space-y-5">
      {/* 作者身份卡（按角色锁定展示） */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-low border border-outline-variant/40">
        <div className="w-9 h-9 bg-ink rounded-lg flex items-center justify-center shrink-0">
          <Megaphone size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-on-surface">
            以「{labelOf(AUTHOR_TYPE, authorType)}」身份发布
          </p>
          <p className="text-xs text-on-surface-variant truncate">
            {admin.name}
            {admin.organizationName ? ` · ${admin.organizationName}` : ''}
          </p>
        </div>
        <StatusBadge meta={AUTHOR_TYPE} value={authorType} />
      </div>

      {/* 板块选择 */}
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

      {/* 学校：学生会锁定本校必填；团队/商家选填（空=跨校） */}
      <Field
        label="学校标注"
        required={schoolLocked}
        hint={schoolLocked ? '学生会账号锁定为绑定学校' : '选填，留空为跨校'}
      >
        <Input
          value={school}
          onChange={(e) => setSchool(e.target.value)}
          disabled={schoolLocked}
          placeholder={schoolLocked ? '' : '例如：University of Warwick'}
        />
      </Field>

      <Field label="标题" hint="选填，最长 100 字">
        <Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="例如：校园活动预告" />
      </Field>

      <Field label="正文" required>
        <Textarea
          className="min-h-[120px]"
          value={content}
          maxLength={2000}
          onChange={(e) => setContent(e.target.value)}
          placeholder="输入正文内容…"
        />
        <p className="text-xs text-outline mt-1 text-right font-mono">{content.length}/2000</p>
      </Field>

      {/* 图片 URL 增删（去重）+ 缩略图 */}
      <div>
        <span className="label">图片 URL（选填）</span>
        <div className="flex gap-2">
          <Input
            type="url"
            className="flex-1"
            value={imageInput}
            onChange={(e) => setImageInput(e.target.value)}
            onKeyDown={(e) => {
              // 回车加图而非提交整个表单
              if (e.key === 'Enter') {
                e.preventDefault();
                addImage();
              }
            }}
            placeholder="https://..."
          />
          <Button type="button" onClick={addImage} className="shrink-0">
            <Plus size={15} /> 添加
          </Button>
        </div>
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {images.map((url) => (
              <div key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-outline-variant/60" />
                <button
                  type="button"
                  onClick={() => setImages(images.filter((i) => i !== url))}
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

      {/* 赞助内容开关：商家强制开且禁用（后端同样强制） */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="label mb-0">标记为赞助内容</span>
          <p className="text-xs text-outline mt-0.5">
            {sponsorForced ? '商家帖子始终标记为赞助' : '商业推广类帖子请开启'}
          </p>
        </div>
        <Switch
          checked={sponsorForced || isSponsored}
          onChange={(v) => setIsSponsored(v)}
          disabled={sponsorForced}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" variant="cta" loading={submitting}>
          <Send size={16} /> 发布官方帖
        </Button>
      </div>
    </form>
  );
}
