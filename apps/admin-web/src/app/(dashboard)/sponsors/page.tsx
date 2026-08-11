import { redirect } from 'next/navigation';

/**
 * 旧 /sponsors 页已并入 /accounts（学生会视角自动呈现本校广告商列表）。
 * 服务端组件 redirect 在 RSC 渲染期即生效，先于客户端 Guard——兼容学生会旧书签。
 */
export default function SponsorsPage() {
  redirect('/accounts');
}
