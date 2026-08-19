# unimathca1 精简工程

这是从 `/mnt/e/Users/DELL/Desktop/unimatcha` 提取出的后续开发骨架版。

## 保留策略

- 保留根配置、Docker/部署配置、各 app 的 package/tsconfig/项目配置。
- 完整保留 Prisma schema、核心产品文档、匹配算法文档和问卷/院校等参考数据。
- `apps/api/src`、`apps/h5/src`、`apps/admin-web/src`、`apps/web`、`apps/ios/Unimatcha`、`matching-ml/app`、`matching-ml/feedback` 中的代码已压缩为接口骨架：类、函数、DTO、模型、路由边界、ViewModel/Service 名称保留，具体函数体替换为 TODO。
- 删除/不复制：`node_modules`、`dist`、构建缓存、图片资源、大量训练/评估数据、package-lock、测试实现和历史杂项。

## 推荐阅读顺序

1. `README.md`
2. `docs/PRD.md`
3. `apps/api/prisma/schema.prisma`
4. `apps/api/src/app.module.ts`
5. `apps/api/src/matching/providers/match-model.interface.ts`
6. `matching-ml/app/main.py` 与 `matching-ml/app/pipeline/orchestrator.py`
7. `apps/h5/src/main.js`、`apps/ios/Unimatcha/Network/APIClient.swift`
8. `FILE_INDEX.md`

## 注意

这个目录不是可直接运行的完整项目，而是给未来开发者快速理解和继续重建用的工程蓝图。需要恢复某个模块时，优先从原项目拷回对应文件的完整实现。

当前文件数：315
