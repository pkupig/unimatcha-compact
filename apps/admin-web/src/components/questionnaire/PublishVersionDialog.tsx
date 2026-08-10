'use client';

import toast from 'react-hot-toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { QUESTIONNAIRE_TYPE, labelOf } from '@/lib/labels';
import { publishQuestionnaireVersion } from '@/lib/api/questionnaire';
import type { QuestionnaireVersion } from '@/lib/types';

/** 发布确认（QST-2）：发布即原子下线同类型旧激活版本，全体用户切到新版本 */
export function PublishVersionDialog({
  version,
  onClose,
  onDone,
}: {
  version: QuestionnaireVersion;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <ConfirmDialog
      title="发布问卷版本"
      confirmText="发布"
      message={
        <>
          发布「{version.title}」（V{version.version}）后，它将成为
          {labelOf(QUESTIONNAIRE_TYPE, version.type)}的激活版本，
          <strong className="text-on-surface">所有用户将使用新版本</strong>
          ，同类型旧激活版本自动下线。发布后题目将锁定不可修改，确认发布？
        </>
      }
      onConfirm={async () => {
        await publishQuestionnaireVersion(version.id);
        toast.success('已发布为激活版本');
        onDone();
      }}
      onClose={onClose}
    />
  );
}
