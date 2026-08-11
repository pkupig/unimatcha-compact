'use client';

/**
 * 发起洽谈弹窗：主题 + 首条消息。后端同一 广告商×学校 唯一线程——
 * 重复发起不报错而是并入既有线程（existed:true），成功后直落线程页。
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/form';
import { createThread } from '@/lib/api/partners';
import { toastError } from '@/lib/toast';

export interface StartThreadTarget {
  /** school=广告商发起（目标学校）；sponsor=学生会发起（目标广告商） */
  kind: 'school' | 'sponsor';
  id: string;
  /** 弹窗标题区展示的目标名（校名 / 广告商组织名） */
  name: string;
}

export function StartThreadModal({
  target,
  onClose,
}: {
  target: StartThreadTarget;
  onClose: () => void;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = subject.trim().length > 0 && content.trim().length > 0;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const thread = await createThread({
        subject: subject.trim(),
        content: content.trim(),
        // 目标字段按发起方角色二选一（多传后端 400），kind 由目录侧决定
        ...(target.kind === 'school'
          ? { targetSchoolId: target.id }
          : { targetSponsorAdminId: target.id }),
      });
      toast.success(thread.existed ? '已并入既有洽谈' : '洽谈已发起');
      onClose();
      router.push(`/partners/${thread.id}`);
    } catch (e) {
      toastError(e);
      // 仅失败复位提交态；成功路径即将跳离本页，保持禁用防连击
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="发起洽谈"
      caption={`对象：${target.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            发送
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <Field
          label="洽谈主题"
          required
          hint="同一对象只保留一条洽谈线程，重复发起会自动并入"
        >
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={80}
            placeholder="例如：迎新周联合活动（最长 80 字）"
          />
        </Field>
        <Field label="首条消息" required>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="介绍来意与合作想法（最长 2000 字）"
          />
        </Field>
      </div>
    </Modal>
  );
}
