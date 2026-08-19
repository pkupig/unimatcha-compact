# Unimatcha · H5 移动端

Vite + 原生 ES Modules 构建的移动端 SPA。Tailwind 通过 CDN 加载，因此 Vite 只负责打包
`src/` 下的 JS 模块并拷贝 `public/` 静态资源。

## 开发

```bash
npm install
npm run dev       # http://localhost:3002（热更新）
npm run build     # 产物 -> dist/
npm run preview   # 预览生产构建
```

## 结构

```
index.html              HTML 外壳（标签 + Tailwind CDN 配置），仅 <script type="module" src="/src/main.js">
public/                 静态资源（splash_bg.png / login_bg.png），按 /xxx 访问
src/
├── main.js             入口：导入样式 + 各模块，并在 DOMContentLoaded 启动
├── state.js            共享可变状态对象 S（28 个全局状态字段）
├── styles/main.css     全局样式（由原内联 <style> 抽离）
└── modules/            按领域拆分的功能模块（共 122 个函数）
    ├── core.js          API 请求 / 页面导航 / 通用工具（api、showPage、toast…）
    ├── auth.js          登录 / 注册 / 登出 / 验证
    ├── profile.js       资料设置 / 编辑 / 标签 / 照片 / 偏好
    ├── questionnaire.js 问卷渲染 / 作答 / 提交
    ├── match.js         匹配池 / 状态机 / 倒计时 / 筛选 / 对象资料
    ├── chat.js          情侣聊天（轮询）
    ├── square.js        情侣广场（帖子 / 详情 / 评论 / 发帖）
    ├── notifications.js 通知中心（轮询）
    └── settings.js      设置 / 隐私开关
```

## 设计约定

- **共享状态**：所有跨模块状态集中在 `state.js` 的 `S` 对象。各模块 `import { S }` 后通过
  `S.currentUser`、`S.answers` 等读写，避免散落的全局变量。
- **函数挂载到 `window`**：每个功能函数定义后 `window.fnName = fnName`。这样既保留了
  HTML 中现有的内联 `onclick="fnName(...)"` 绑定，模块之间也可直接以 `window.fnName()` 互相调用，
  无需维护繁琐的 import 关系。
- **新增模块**：在 `src/modules/` 新建文件，`import { S } from '../state.js'`，并在 `main.js`
  的导入列表中加入即可。
