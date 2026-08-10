import { redirect } from 'next/navigation';

/** 旧书签兼容：后管账号页已并入 /accounts（服务端重定向，先于客户端 Guard 生效） */
export default function AdminAccountsRedirect() {
  redirect('/accounts');
}
