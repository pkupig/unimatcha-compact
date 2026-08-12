'use client';

/**
 * 官方帖编辑弹窗（输入风格对齐 OfficialPostForm）：
 * 后管帖行只有作者展示名，前端无法判定当前 admin 是否作者——按钮照常展示，
 * 非作者/非 SUPER 提交由后端 403 兜底（toastError 直显中文报错）。
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/form';
import { updateOfficialPost } from '@/lib/api/moderation';
import { toastError } from '@/lib/toast';
import type { AdminSquarePost } from '@/lib/types';

export function EditOfficialPostModal({
  post,
  onClose,
  onSaved,
}: {
  post: AdminSquarePost;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState(post.title ?? '');
  const [content, setContent] = useState(post.content);
  const [images, setImages] = useState<string[]>(post.images);
  const [imageInput, setImageInput] = useState('');
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

  const submit = async () => {
    if (!content.trim()) {
      toast.error('正文不能为空');
      return;
    }
    setSubmitting(true);
    try {
      // 三字段全量提交（title 传空串可清空标题；PATCH 缺省字段=不修改）
      await updateOfficialPost(post.id, {
        title: title.trim(),
        content: content.trim(),
        images,
      });
      toast.success('官方帖已更新');
      await onSaved();
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="编辑官方帖"
      caption="EDIT OFFICIAL POST"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" variant="primary" loading={submitting} onClick={() => void submit()}>
            保存修改
          </Button>
        </>
      }
    >
      <div className="space-y-5 pb-2">
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

        {/* 图片 URL 增删（去重）+ 缩略图，与 OfficialPostForm 同款 */}
        <div>
          <span className="label">图片 URL（选填）</span>
          <div className="flex gap-2">
            <Input
              type="url"
              className="flex-1"
              value={imageInput}
              onChange={(e) => setImageInput(e.target.value)}
              onKeyDown={(e) => {
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

        <p className="text-xs text-on-surface-variant">
          仅原发布账号或超级管理员可保存；活动帖不支持在此编辑。
        </p>
      </div>
    </Modal>
  );
}
