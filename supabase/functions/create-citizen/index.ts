import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const allowedParties = new Set([
  'Independent',
  'United Front',
  "People's Assembly",
  'Civic Order',
]);

const allowedAvatarTypes = new Set(['builtin', 'upload']);
const allowedBuiltinAvatarUrls = new Set([
  './assets/avatars/aurelia-voss.svg',
  './assets/avatars/jasper-reed.svg',
  './assets/avatars/mira-sloane.svg',
  './assets/avatars/dorian-kestrel.svg',
  './assets/avatars/leah-cortez.svg',
  './assets/avatars/omar-tate.svg',
]);

const allowedOrigins = new Set([
  'http://127.0.0.1:5500',
  'http://localhost:8000',
  'http://localhost:3000',
  'https://vslscreations.github.io',
]);

const getCorsHeaders = (origin: string | null): Record<string, string> => {
  const requestOrigin = typeof origin === 'string' ? origin.trim() : '';

  if (!allowedOrigins.has(requestOrigin)) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': requestOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
};

const sanitizeText = (value: unknown, fieldName: string, maxLength = 32) => {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} is required.`);
  }

  const cleaned = value.replace(/[^a-zA-Z' -]/g, '').trim();
  if (!cleaned) {
    throw new Error(`${fieldName} is required.`);
  }

  if (cleaned.length > maxLength) {
    throw new Error(`${fieldName} is too long.`);
  }

  return cleaned;
};

const resolvePublicName = (payload: Record<string, unknown>) => {
  const directValue = typeof payload.public_name === 'string' ? payload.public_name : '';
  if (directValue.trim()) {
    return sanitizeText(directValue, 'public_name', 64);
  }

  const firstName = typeof payload.first_name === 'string' ? payload.first_name : '';
  const lastName = typeof payload.last_name === 'string' ? payload.last_name : '';
  const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (!combined) {
    throw new Error('A public name is required.');
  }

  return sanitizeText(combined, 'public_name', 64);
};

const getDefaultValueFromJsonConfig = (rawValue: string | undefined, keyName: string) => {
  if (!rawValue) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    const value = typeof parsed?.default === 'string' ? parsed.default : undefined;
    if (!value) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
};

const jsonResponse = (status: number, payload: Record<string, unknown>, origin: string | null = null) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin),
    } as Record<string, string>,
  });

serve(async (req) => {
  try {
    const origin = req.headers.get('Origin');
    const corsHeaders: Record<string, string> = getCorsHeaders(origin);

    if (!origin || !corsHeaders['Access-Control-Allow-Origin']) {
      return new Response(JSON.stringify({ error: 'Origin not allowed.' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse(401, { error: 'Missing bearer token.' }, origin);
    }

    const accessToken = authHeader.replace(/^Bearer\s+/i, '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = getDefaultValueFromJsonConfig(
      Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
      'SUPABASE_PUBLISHABLE_KEYS',
    ) ?? Deno.env.get('SUPABASE_ANON_KEY');
    const secretKey = getDefaultValueFromJsonConfig(
      Deno.env.get('SUPABASE_SECRET_KEYS'),
      'SUPABASE_SECRET_KEYS',
    ) ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !publishableKey || !secretKey) {
      return jsonResponse(500, {
        error: 'Edge Function is missing Supabase environment variables.',
      }, origin);
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse(401, {
        error: userError?.message ?? 'User authentication failed.',
      }, origin);
    }

    if (!user.email_confirmed_at) {
      return jsonResponse(403, {
        error: 'Email must be verified before creating a citizen.',
      }, origin);
    }

    const payload = await req.json().catch(() => ({}));
    const publicName = resolvePublicName(payload);

    const avatarType = typeof payload.avatar_type === 'string'
      ? payload.avatar_type.trim()
      : 'builtin';
    const avatarUrl = typeof payload.avatar_url === 'string' && payload.avatar_url.trim()
      ? payload.avatar_url.trim()
      : null;

    if (avatarType === 'upload') {
      return jsonResponse(400, {
        error: 'Avatar uploads are not enabled yet.',
      }, origin);
    }

    if (!allowedAvatarTypes.has(avatarType)) {
      return jsonResponse(400, {
        error: 'The selected avatar is not allowed.',
      }, origin);
    }

    if (!avatarUrl || !allowedBuiltinAvatarUrls.has(avatarUrl)) {
      return jsonResponse(400, {
        error: 'The selected built-in avatar is not permitted.',
      }, origin);
    }

    const party = typeof payload.political_party === 'string'
      ? payload.political_party.trim()
      : typeof payload.party === 'string'
        ? payload.party.trim()
        : '';

    if (!allowedParties.has(party)) {
      return jsonResponse(400, {
        error: 'The selected party is not allowed.',
      }, origin);
    }

    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // The safe execution path is a service-role client from the Edge Function.
    // That ensures the RPC call runs under the service_role role, which is the trusted
    // execution context expected by public.prevent_protected_citizen_changes().

    const { data: existingCitizen, error: lookupError } = await adminClient
      .from('citizens')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (lookupError && lookupError.code !== 'PGRST116') {
      return jsonResponse(500, {
        error: lookupError.message,
      }, origin);
    }

    if (existingCitizen) {
      return jsonResponse(409, {
        error: 'Citizen already exists for this authenticated user.',
      }, origin);
    }

    const { data, error } = await adminClient.rpc('create_citizen_and_private', {
      p_auth_user_id: user.id,
      p_public_name: publicName,
      p_avatar_type: avatarType,
      p_avatar_url: avatarUrl,
      p_political_party: party,
    });

    if (error) {
      return jsonResponse(400, {
        error: error.message,
      }, origin);
    }

    return jsonResponse(200, {
      citizen: data,
    }, origin);
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error.',
    }, req.headers.get('Origin'));
  }
});
