import toast from 'react-hot-toast';

/**
 * 复制到剪贴板（全站唯一实现）：clipboard API 优先，execCommand 兜底。
 * 原 CredentialCard 内私有实现提级共享（邀请链接/凭据卡/票码等均用）。
 */
export async function copyText(text: string, successMessage = '已复制'): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast.success(successMessage);
  } catch {
    toast.error('复制失败，请手动选择复制');
  }
}
