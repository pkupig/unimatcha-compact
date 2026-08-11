'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Dices } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/form';
import { CredentialCard } from '@/components/accounts/CredentialCard';
import { convertSubmission } from '@/lib/api/submissions';
import { listSchools } from '@/lib/api/schools';
import { toastError } from '@/lib/toast';
import type { ConvertSubmissionInput, School, Submission } from '@/lib/types';

/** 学校下拉里「新建学校…」的哨兵值（提交时换成 newSchoolName/City） */
const NEW_SCHOOL = '__new__';

/**
 * 随机初始密码：12 位，crypto.getRandomValues；
 * 前三位钉死大写/小写/数字各一保证类别齐全，字符集剔除易混的 0O1lI（含 o），
 * 最后 Fisher–Yates 洗牌消除「前三位固定类别」的模式。
 */
function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const rand = new Uint32Array(12);
  crypto.getRandomValues(rand);
  const chars = Array.from(rand, (r, i) => {
    if (i === 0) return upper[r % upper.length];
    if (i === 1) return lower[r % lower.length];
    if (i === 2) return digits[r % digits.length];
    return all[r % all.length];
  });
  const swap = new Uint32Array(chars.length);
  crypto.getRandomValues(swap);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = swap[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

interface Creds {
  email: string;
  password: string;
  adminName: string;
  schoolName: string | null;
}

/**
 * 开通账号（SUB-6/7，仅赞助申请 tab 的 PENDING/CONTACTED 行）：
 * 表单提交成功后切换为一次性凭据卡并刷新列表（弹窗保持打开展示凭据）。
 */
export function ConvertModal({
  data,
  onClose,
  onDone,
}: {
  data: Submission;
  onClose: () => void;
  /** 开通成功即刷新列表（弹窗停留在凭据卡） */
  onDone: () => void;
}) {
  const [role, setRole] = useState<'STUDENT_UNION' | 'SPONSOR'>('STUDENT_UNION');
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolCity, setNewSchoolCity] = useState('');
  const [organizationName, setOrganizationName] = useState(data.organization ?? '');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [sourceSchoolId, setSourceSchoolId] = useState('');
  const [name, setName] = useState(data.organization ?? '');
  const [email, setEmail] = useState(data.email);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<Creds | null>(null);

  // 学校下拉（绑定现有学校 / 广告商来源学校共用；后端 limit 封顶 100）
  useEffect(() => {
    listSchools({ limit: 100 })
      .then((res) => setSchools(res.items))
      .catch((e) => toastError(e, '加载学校列表失败'));
  }, []);

  const submit = async () => {
    // 校验先行（对齐后端规则），避免半截请求
    if (!name.trim()) return toastError(null, '请填写账号名');
    if (role === 'STUDENT_UNION') {
      if (!schoolId) return toastError(null, '请选择学校');
      if (schoolId === NEW_SCHOOL && !newSchoolName.trim()) return toastError(null, '请填写新学校名称');
    } else if (!organizationName.trim()) {
      return toastError(null, '请填写组织名称');
    }
    if (password.length < 8) return toastError(null, '初始密码至少 8 位（可点随机生成）');

    const body: ConvertSubmissionInput = { accountRole: role, name: name.trim(), password };
    const trimmedEmail = email.trim();
    if (trimmedEmail) body.email = trimmedEmail; // 缺省后端自动用申请邮箱
    if (role === 'STUDENT_UNION') {
      if (schoolId === NEW_SCHOOL) {
        body.newSchoolName = newSchoolName.trim();
        if (newSchoolCity.trim()) body.newSchoolCity = newSchoolCity.trim();
      } else {
        body.schoolId = schoolId;
      }
    } else {
      body.organizationName = organizationName.trim();
      if (contactName.trim()) body.contactName = contactName.trim();
      if (contactPhone.trim()) body.contactPhone = contactPhone.trim();
      if (sourceSchoolId) body.schoolId = sourceSchoolId; // 后端映射为 sourcedBySchoolId
    }

    setBusy(true);
    try {
      const res = await convertSubmission(data.id, body);
      setCreds({
        email: res.admin.email,
        password: res.initialPassword,
        adminName: res.admin.name,
        schoolName: res.school ? res.school.name : null,
      });
      toast.success('账号已开通');
      onDone();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={creds ? '账号已开通' : '开通账号'}
      caption="Convert"
      onClose={onClose}
      footer={
        creds ? (
          <Button size="sm" variant="primary" onClick={onClose}>
            完成
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button size="sm" variant="primary" loading={busy} onClick={() => void submit()}>
              开通账号
            </Button>
          </>
        )
      }
    >
      {creds ? (
        <div className="space-y-4 pb-2">
          <p className="text-sm text-on-surface">
            后台账号<span className="font-bold">「{creds.adminName}」</span>已创建
            {creds.schoolName ? <>，学校：{creds.schoolName}</> : null}。
          </p>
          <CredentialCard email={creds.email} password={creds.password} />
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <Field label="账号类型" required>
            <div className="flex items-center gap-5 pt-1">
              {(
                [
                  ['STUDENT_UNION', '学生会'],
                  ['SPONSOR', '广告商'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="convert-account-role"
                    className="accent-ink"
                    checked={role === value}
                    onChange={() => setRole(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>

          {role === 'STUDENT_UNION' ? (
            <>
              <Field label="学校" required>
                <Select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                  <option value="">请选择学校</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value={NEW_SCHOOL}>新建学校…</option>
                </Select>
              </Field>
              {schoolId === NEW_SCHOOL && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="新学校名称" required>
                    <Input
                      value={newSchoolName}
                      onChange={(e) => setNewSchoolName(e.target.value)}
                      placeholder="如 University of Warwick"
                    />
                  </Field>
                  <Field label="城市">
                    <Input
                      value={newSchoolCity}
                      onChange={(e) => setNewSchoolCity(e.target.value)}
                      placeholder="选填"
                    />
                  </Field>
                </div>
              )}
            </>
          ) : (
            <>
              <Field label="组织名称" required>
                <Input
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="广告商 / 机构名称"
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="联系人">
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="选填" />
                </Field>
                <Field label="联系电话">
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="选填" />
                </Field>
              </div>
              <Field label="来源学校" hint="学生会自拉广告商选来源学校；平台直签留空">
                <Select value={sourceSchoolId} onChange={(e) => setSourceSchoolId(e.target.value)}>
                  <option value="">平台直签</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          <Field label="账号名" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="后台展示名称" />
          </Field>
          <Field label="登录邮箱" hint="默认使用申请邮箱，可修改">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={data.email}
            />
          </Field>
          <Field label="初始密码" required hint="密码仅在开通成功后一次性展示">
            <div className="flex gap-2">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入或随机生成（≥8 位）"
                className="font-mono"
              />
              <Button size="sm" className="shrink-0 self-stretch" onClick={() => setPassword(generatePassword())}>
                <Dices size={14} />
                随机生成
              </Button>
            </div>
          </Field>
        </div>
      )}
    </Modal>
  );
}
