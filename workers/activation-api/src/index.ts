/**
 * NeuroDual Activation API
 *
 * Cloudflare Worker + D1 for managing premium activation codes.
 * - POST /generate  — webhook from payment providers (creates a code)
 * - POST /activate  — activate a code on a device (max 3)
 * - POST /deactivate — remove a device from a code
 * - GET  /verify    — check if a device is activated
 */

interface Env {
  DB: D1Database;
  MAX_ACTIVATIONS: string;
  WEBHOOK_SECRET: string;
}

interface Activation {
  code: string;
  device_id: string;
  device_name: string | null;
  activated_at: number;
}

// =============================================================================
// Helpers
// =============================================================================

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const segments: string[] = [];
  for (let s = 0; s < 3; s++) {
    let segment = '';
    for (let i = 0; i < 4; i++) {
      segment += chars[bytes[s * 4 + i]! % chars.length];
    }
    segments.push(segment);
  }
  return `ND-${segments.join('-')}`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function cors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// =============================================================================
// Rate limiting (in-memory, per-isolate — resets on cold start, good enough)
// =============================================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_MAX = 5; // max attempts per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /generate
 * Called by payment webhooks after successful purchase.
 * Body: { source: 'google' | 'apple' | 'lemon', sourceOrderId?: string, secret: string }
 */
async function handleGenerate(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as {
    source?: string;
    sourceOrderId?: string;
    secret?: string;
  };

  if (!body.secret || body.secret !== env.WEBHOOK_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  const source = body.source;
  if (!source || !['google', 'apple', 'lemon', 'manual'].includes(source)) {
    return json({ error: 'invalid_source' }, 400);
  }

  const code = generateCode();
  await env.DB.prepare(
    'INSERT INTO codes (code, source, source_order_id) VALUES (?, ?, ?)',
  )
    .bind(code, source, body.sourceOrderId ?? null)
    .run();

  return json({ code });
}

/**
 * POST /activate
 * Activate a code on a device.
 * Body: { code: string, deviceId: string, deviceName?: string }
 */
async function handleActivate(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (isRateLimited(ip)) {
    return json({ error: 'rate_limited' }, 429);
  }

  const body = (await request.json()) as {
    code?: string;
    deviceId?: string;
    deviceName?: string;
  };

  const code = body.code?.trim().toUpperCase();
  const deviceId = body.deviceId?.trim();

  if (!code || !deviceId) {
    return json({ error: 'missing_fields' }, 400);
  }

  // Check code exists
  const codeRow = await env.DB.prepare('SELECT code FROM codes WHERE code = ?')
    .bind(code)
    .first();

  if (!codeRow) {
    return json({ error: 'invalid_code' }, 404);
  }

  // Check if device already activated with this code
  const existing = await env.DB.prepare(
    'SELECT device_id FROM activations WHERE code = ? AND device_id = ?',
  )
    .bind(code, deviceId)
    .first();

  if (existing) {
    return json({ success: true, alreadyActivated: true });
  }

  // Check activation count
  const maxActivations = parseInt(env.MAX_ACTIVATIONS, 10) || 3;
  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM activations WHERE code = ?',
  )
    .bind(code)
    .first<{ count: number }>();

  const count = countResult?.count ?? 0;
  if (count >= maxActivations) {
    return json({ error: 'max_activations', maxActivations, currentCount: count }, 403);
  }

  // Activate
  await env.DB.prepare(
    'INSERT INTO activations (code, device_id, device_name) VALUES (?, ?, ?)',
  )
    .bind(code, deviceId, body.deviceName ?? null)
    .run();

  return json({ success: true, activationsUsed: count + 1, maxActivations });
}

/**
 * POST /deactivate
 * Remove a device activation.
 * Body: { code: string, deviceId: string }
 */
async function handleDeactivate(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as {
    code?: string;
    deviceId?: string;
  };

  const code = body.code?.trim().toUpperCase();
  const deviceId = body.deviceId?.trim();

  if (!code || !deviceId) {
    return json({ error: 'missing_fields' }, 400);
  }

  const result = await env.DB.prepare(
    'DELETE FROM activations WHERE code = ? AND device_id = ?',
  )
    .bind(code, deviceId)
    .run();

  return json({ success: true, removed: result.meta.changes > 0 });
}

/**
 * GET /verify?code=XXX&deviceId=YYY
 * Check if a device is activated.
 */
async function handleVerify(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.trim().toUpperCase();
  const deviceId = url.searchParams.get('deviceId')?.trim();

  if (!code || !deviceId) {
    return json({ error: 'missing_fields' }, 400);
  }

  const activation = await env.DB.prepare(
    'SELECT device_id, activated_at FROM activations WHERE code = ? AND device_id = ?',
  )
    .bind(code, deviceId)
    .first();

  if (!activation) {
    return json({ activated: false });
  }

  // Also get all activations for this code (for the profile UI)
  const allActivations = await env.DB.prepare(
    'SELECT device_id, device_name, activated_at FROM activations WHERE code = ? ORDER BY activated_at',
  )
    .bind(code)
    .all<Activation>();

  const maxActivations = parseInt(env.MAX_ACTIVATIONS, 10) || 3;

  return json({
    activated: true,
    activationsUsed: allActivations.results.length,
    maxActivations,
    devices: allActivations.results.map((a) => ({
      deviceId: a.device_id,
      deviceName: a.device_name,
      activatedAt: a.activated_at,
    })),
  });
}

/**
 * POST /purchase
 * Called by the client after a successful store purchase or restore.
 * Idempotent: if transactionId already has a code, reuses it.
 * Body: { transactionId: string, store: 'google'|'apple', deviceId: string, deviceName?: string }
 */
async function handlePurchase(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (isRateLimited(ip)) {
    return json({ error: 'rate_limited' }, 429);
  }

  const body = (await request.json()) as {
    transactionId?: string;
    store?: string;
    deviceId?: string;
    deviceName?: string;
  };

  const transactionId = body.transactionId?.trim();
  const store = body.store;
  const deviceId = body.deviceId?.trim();

  if (!transactionId || !store || !deviceId) {
    return json({ error: 'missing_fields' }, 400);
  }

  if (!['google', 'apple'].includes(store)) {
    return json({ error: 'invalid_store' }, 400);
  }

  const maxActivations = parseInt(env.MAX_ACTIVATIONS, 10) || 3;

  // Check if this transaction already generated a code (idempotent for restore)
  let codeRow = await env.DB.prepare(
    'SELECT code FROM codes WHERE source_order_id = ? AND source = ?',
  )
    .bind(transactionId, store)
    .first<{ code: string }>();

  let code: string;

  if (codeRow) {
    // Reuse existing code
    code = codeRow.code;
  } else {
    // Generate new code for this purchase
    code = generateCode();
    await env.DB.prepare(
      'INSERT INTO codes (code, source, source_order_id) VALUES (?, ?, ?)',
    )
      .bind(code, store, transactionId)
      .run();
  }

  // Activate on this device (same logic as /activate)
  const existing = await env.DB.prepare(
    'SELECT device_id FROM activations WHERE code = ? AND device_id = ?',
  )
    .bind(code, deviceId)
    .first();

  if (existing) {
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM activations WHERE code = ?',
    )
      .bind(code)
      .first<{ count: number }>();

    return json({
      success: true,
      code,
      alreadyActivated: true,
      activationsUsed: countResult?.count ?? 1,
      maxActivations,
    });
  }

  // Check activation count
  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM activations WHERE code = ?',
  )
    .bind(code)
    .first<{ count: number }>();

  const count = countResult?.count ?? 0;
  if (count >= maxActivations) {
    return json({ error: 'max_activations', code, maxActivations, currentCount: count }, 403);
  }

  // Activate
  await env.DB.prepare(
    'INSERT INTO activations (code, device_id, device_name) VALUES (?, ?, ?)',
  )
    .bind(code, deviceId, body.deviceName ?? null)
    .run();

  return json({ success: true, code, activationsUsed: count + 1, maxActivations });
}

// =============================================================================
// Router
// =============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return cors();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/generate' && request.method === 'POST') {
        return handleGenerate(request, env);
      }
      if (path === '/activate' && request.method === 'POST') {
        return handleActivate(request, env);
      }
      if (path === '/purchase' && request.method === 'POST') {
        return handlePurchase(request, env);
      }
      if (path === '/deactivate' && request.method === 'POST') {
        return handleDeactivate(request, env);
      }
      if (path === '/verify' && request.method === 'GET') {
        return handleVerify(request, env);
      }
      return json({ error: 'not_found' }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: 'internal_error' }, 500);
    }
  },
};
