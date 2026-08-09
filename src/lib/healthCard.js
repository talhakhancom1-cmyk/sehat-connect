import { base44 } from '@/api/base44Client';

// High-entropy, single-purpose opaque token — never encodes patient id or medical data.
export function generateOpaqueToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildVerifyUrl(token) {
  const origin = window.location.origin;
  return `${origin}/doctor/verify-card?token=${token}`;
}

export async function issueCardToken(card, patientId, { expiresInHours = 1, maxViews = 1 }) {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();
  return base44.entities.HealthCardToken.create({
    card_id: card.id,
    token,
    status: 'active',
    expires_at: expiresAt,
    max_views: maxViews,
    view_count: 0,
    created_by_id_ref: patientId,
  });
}

export async function revokeToken(tokenId) {
  return base44.entities.HealthCardToken.update(tokenId, {
    status: 'revoked',
    revoked_at: new Date().toISOString(),
  });
}