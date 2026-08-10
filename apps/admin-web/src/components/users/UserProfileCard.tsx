import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { UserProfileDetail } from '@/lib/types';

/** USRD-2 资料网格（昵称/真实姓名/性别/年龄/学校/年级/专业/城市/MBTI）+ 简介 + 兴趣标签 */
export function UserProfileCard({ profile }: { profile: UserProfileDetail | null }) {
  if (!profile) {
    return (
      <Card caption="PROFILE" title="资料">
        <p className="text-sm text-outline">该用户尚未填写资料</p>
      </Card>
    );
  }

  // 性别等元数据后端存英文原文（male/female...），后台按原值展示不做翻译
  const fields: [string, string | number | null][] = [
    ['昵称', profile.nickname],
    ['真实姓名', profile.realName],
    ['性别', profile.gender],
    ['年龄', profile.age],
    ['学校', profile.school],
    ['年级', profile.grade],
    ['专业', profile.major],
    ['城市', profile.city],
    ['MBTI', profile.mbti],
  ];

  return (
    <Card caption="PROFILE" title="资料">
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="caption">{label}</dt>
            <dd className="text-on-surface mt-1">{value ?? '-'}</dd>
          </div>
        ))}
      </dl>
      {profile.bio && (
        <div className="mt-4">
          <p className="caption">简介</p>
          <p className="text-on-surface-variant mt-1 whitespace-pre-wrap text-sm">{profile.bio}</p>
        </div>
      )}
      {profile.interests.length > 0 && (
        <div className="mt-4">
          <p className="caption mb-1.5">兴趣标签</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.interests.map((t) => (
              <Badge key={t} variant="neutral">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
