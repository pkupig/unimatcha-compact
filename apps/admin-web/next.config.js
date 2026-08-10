/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker 部署需要 standalone 产物；Windows 本地构建 symlink 无权限，
  // 本地门禁用 NEXT_STANDALONE=0 跳过（服务器 Dockerfile 不设该变量，行为不变）。
  ...(process.env.NEXT_STANDALONE === '0' ? {} : { output: 'standalone' }),
  // NEXT_PUBLIC_API_URL 经 Dockerfile 构建 ARG 注入并内联；
  // 本地缺省时由 lib/api/client.ts 兜底 localhost:3001（此处不再重复定义）。
};

module.exports = nextConfig;
