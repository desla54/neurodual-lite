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
  LEGACY_MIGRATION_ENABLED?: string;
  LEGACY_MIGRATION_MAX_CODES?: string;
  GOOGLE_PLAY_PACKAGE_NAME?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
}

interface Activation {
  code: string;
  device_id: string;
  device_name: string | null;
  activated_at: number;
}

interface GoogleProductPurchase {
  purchaseState?: number;
  consumptionState?: number;
  acknowledgementState?: number;
  productId?: string;
  orderId?: string;
  purchaseToken?: string;
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

function base64UrlEncode(data: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function importGooglePrivateKey(privateKeyPem: string): Promise<CryptoKey> {
  const normalized = privateKeyPem.replace(/\\n/g, '\n').trim();
  const keyData = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');

  const binary = Uint8Array.from(atob(keyData), (char) => char.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binary.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );
}

async function getGoogleAccessToken(env: Env): Promise<string> {
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error('google_auth_not_configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claimSet))}`;
  const signer = await importGooglePrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signer,
    new TextEncoder().encode(unsignedToken),
  );

  const assertion = `${unsignedToken}.${base64UrlEncode(signature)}`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`google_oauth_failed:${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('google_oauth_missing_access_token');
  }

  return data.access_token;
}

async function validateGooglePurchase(
  env: Env,
  productId: string,
  purchaseToken: string,
): Promise<GoogleProductPurchase> {
  const packageName = env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!packageName) {
    throw new Error('google_package_not_configured');
  }

  const accessToken = await getGoogleAccessToken(env);
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`google_validation_failed:${response.status}`);
  }

  return (await response.json()) as GoogleProductPurchase;
}

function isGoogleValidationConfigured(env: Env): boolean {
  return Boolean(
    env.GOOGLE_PLAY_PACKAGE_NAME &&
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  );
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
    productId?: string;
    deviceId?: string;
    deviceName?: string;
    purchaseToken?: string;
    orderId?: string;
    receipt?: string;
    jwsRepresentation?: string;
  };

  const transactionId = body.transactionId?.trim();
  const store = body.store;
  const productId = body.productId?.trim();
  const deviceId = body.deviceId?.trim();
  const purchaseToken = body.purchaseToken?.trim();

  if (!store || !productId || !deviceId) {
    return json({ error: 'missing_fields' }, 400);
  }

  if (!['google', 'apple'].includes(store)) {
    return json({ error: 'invalid_store' }, 400);
  }

  let purchaseKey: string;

  if (store === 'google') {
    if (!purchaseToken) {
      return json({ error: 'missing_purchase_token' }, 400);
    }

    if (isGoogleValidationConfigured(env)) {
      try {
        const googlePurchase = await validateGooglePurchase(env, productId, purchaseToken);

        if (googlePurchase.purchaseState !== 0) {
          return json(
            { error: 'purchase_not_completed', purchaseState: googlePurchase.purchaseState },
            403,
          );
        }

        if (googlePurchase.productId && googlePurchase.productId !== productId) {
          return json({ error: 'product_mismatch' }, 403);
        }
      } catch (error) {
        console.error('Google purchase validation failed', error);
        return json({ error: 'purchase_validation_failed' }, 403);
      }
    } else {
      console.warn(
        'Google purchase validation is not configured; accepting unverified purchase token for compatibility.',
      );
    }

    purchaseKey = purchaseToken;
  } else {
    if (!transactionId) {
      return json({ error: 'missing_transaction_id' }, 400);
    }

    // Apple verification is not implemented in this worker yet.
    purchaseKey = transactionId;
  }

  const maxActivations = parseInt(env.MAX_ACTIVATIONS, 10) || 3;

  // Check if this transaction already generated a code (idempotent for restore)
  let codeRow = await env.DB.prepare(
    'SELECT code FROM codes WHERE source_order_id = ? AND source = ?',
  )
    .bind(purchaseKey, store)
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
      .bind(code, store, purchaseKey)
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

/**
 * POST /legacy-migrate
 * One-time server-side code issuance for legacy installs.
 * Body: { deviceId: string, deviceName?: string }
 */
async function handleLegacyMigrate(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (isRateLimited(ip)) {
    return json({ error: 'rate_limited' }, 429);
  }

  if (env.LEGACY_MIGRATION_ENABLED !== 'true') {
    return json({ error: 'legacy_migration_disabled' }, 403);
  }

  const body = (await request.json()) as {
    deviceId?: string;
    deviceName?: string;
  };

  const deviceId = body.deviceId?.trim();
  if (!deviceId) {
    return json({ error: 'missing_fields' }, 400);
  }

  const source = 'legacy_migration';
  const sourceOrderId = deviceId;
  const maxActivations = parseInt(env.MAX_ACTIVATIONS, 10) || 3;

  let codeRow = await env.DB.prepare(
    'SELECT code FROM codes WHERE source_order_id = ? AND source = ?',
  )
    .bind(sourceOrderId, source)
    .first<{ code: string }>();

  let code: string;

  if (codeRow) {
    code = codeRow.code;
  } else {
    const legacyCodeLimit = parseInt(env.LEGACY_MIGRATION_MAX_CODES ?? '200', 10) || 200;
    const issuedCountResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM codes WHERE source = ?',
    )
      .bind(source)
      .first<{ count: number }>();

    const issuedCount = issuedCountResult?.count ?? 0;
    if (issuedCount >= legacyCodeLimit) {
      return json(
        {
          error: 'legacy_migration_limit_reached',
          issuedCount,
          legacyCodeLimit,
        },
        403,
      );
    }

    code = generateCode();
    await env.DB.prepare(
      'INSERT INTO codes (code, source, source_order_id) VALUES (?, ?, ?)',
    )
      .bind(code, source, sourceOrderId)
      .run();
  }

  const existing = await env.DB.prepare(
    'SELECT device_id FROM activations WHERE code = ? AND device_id = ?',
  )
    .bind(code, deviceId)
    .first();

  if (!existing) {
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM activations WHERE code = ?',
    )
      .bind(code)
      .first<{ count: number }>();

    const count = countResult?.count ?? 0;
    if (count >= maxActivations) {
      return json({ error: 'max_activations', code, maxActivations, currentCount: count }, 403);
    }

    await env.DB.prepare(
      'INSERT INTO activations (code, device_id, device_name) VALUES (?, ?, ?)',
    )
      .bind(code, deviceId, body.deviceName ?? null)
      .run();
  }

  const allActivations = await env.DB.prepare(
    'SELECT device_id, device_name, activated_at FROM activations WHERE code = ? ORDER BY activated_at',
  )
    .bind(code)
    .all<Activation>();

  return json({
    success: true,
    code,
    activationsUsed: allActivations.results.length,
    maxActivations,
    devices: allActivations.results.map((activation) => ({
      deviceId: activation.device_id,
      deviceName: activation.device_name,
      activatedAt: activation.activated_at,
    })),
  });
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
      if (path === '/legacy-migrate' && request.method === 'POST') {
        return handleLegacyMigrate(request, env);
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
