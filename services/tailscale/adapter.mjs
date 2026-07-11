// tailscale/adapter.mjs - dich OAuth client (TrustCredentials) -> ephemeral TS_AUTHKEY.
// Chay o bootstrap/CI truoc khi start container tailscale. Ghi TS_AUTHKEY vao .env.resolved.
import { makeLogger } from '../../scripts/lib/logger.mjs';
const log = makeLogger('tailscale-adapter');

export async function mintAuthKey({ clientId, clientSecret, tags, ephemeral = true }) {
  log.step(1, 'lay OAuth access token');
  const tokRes = await fetch('https://api.tailscale.com/api/v2/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
  });
  if (!tokRes.ok) throw new Error(`OAuth token that bai: ${tokRes.status}`);
  const { access_token } = await tokRes.json();

  log.step(2, 'tao ephemeral authkey');
  const keyRes = await fetch('https://api.tailscale.com/api/v2/tailnet/-/keys', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      capabilities: { devices: { create: { reusable: false, ephemeral, preauthorized: true, tags: tags.split(',') } } },
      expirySeconds: 3600,
    }),
  });
  if (!keyRes.ok) throw new Error(`Tao authkey that bai: ${keyRes.status}`);
  const { key } = await keyRes.json();
  log.info('da tao ephemeral authkey (TS_AUTHKEY)');
  return key;
}
