import { redirect } from 'next/navigation';

/** 旧书签兼容：关系页已下线，统计并入仪表盘（服务端重定向，先于客户端 Guard 生效） */
export default function RelationshipRedirect() {
  redirect('/dashboard');
}
