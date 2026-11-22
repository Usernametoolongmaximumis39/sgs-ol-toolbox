import { packPublicCode, publicOrigin, tokenFormat, unpackPublicCode } from './public-sync-view.js';

const prefix = 'SGPI1';
export const PUBLIC_INVITE_PATH = '/v2/vault/redeem-invitation';

export const publicInviteCode = (origin, invitation) => packPublicCode(prefix, [origin, invitation]);

export function publicBindingTarget(value) {
  const target = value.trim();
  if (!target.startsWith(prefix + '.')) return { origin: publicOrigin(target) };
  try {
    const [address, invitation] = unpackPublicCode(prefix, target, 2);
    if (!tokenFormat.test(invitation)) throw new Error();
    return { origin: publicOrigin(address), invitation };
  } catch {
    throw new Error('一次性邀请码格式无效，请重新复制');
  }
}
