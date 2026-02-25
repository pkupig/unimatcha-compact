'use client';

import { Heart, Lock } from 'lucide-react';

export default function RelationshipPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">恋爱模式管理</h1>
        <p className="text-sm text-gray-500 mt-0.5">管理已成功匹配进入恋爱模式的用户对</p>
      </div>
      <div className="card flex flex-col items-center py-16 text-center">
        <div className="w-16 h-16 bg-pink-50 rounded-full flex items-center justify-center mb-4">
          <Heart className="text-pink-400" size={28} />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">恋爱模式功能开发中</h2>
        <p className="text-sm text-gray-500 max-w-sm">
          此模块为预留入口，后续版本将实现：查看恋爱中的用户对、进度追踪、双方互动数据分析等功能。
        </p>
        <div className="mt-6 flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-2">
          <Lock size={13} />
          MVP 版本暂不实现，数据库结构已就绪
        </div>
      </div>
    </div>
  );
}
