import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
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
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
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

    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: citizen, error: citizenError } = await adminClient
      .from('citizens')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (citizenError && citizenError.code !== 'PGRST116') {
      return jsonResponse(500, {
        error: citizenError.message,
      }, origin);
    }

    if (!citizen) {
      return jsonResponse(404, {
        error: 'Citizen profile not found for the authenticated user.',
      }, origin);
    }

    const { data: privateRecord, error: privateError } = await adminClient
      .from('citizen_private')
      .select('balance, profession, social_class, education, account_status')
      .eq('citizen_id', citizen.id)
      .maybeSingle();

    if (privateError && privateError.code !== 'PGRST116') {
      return jsonResponse(500, {
        error: privateError.message,
      }, origin);
    }

    if (!privateRecord) {
      return jsonResponse(404, {
        error: 'Private citizen profile not found.',
      }, origin);
    }

    return jsonResponse(200, {
      balance: privateRecord.balance ?? null,
      profession: privateRecord.profession ?? null,
      social_class: privateRecord.social_class ?? null,
      education: privateRecord.education ?? null,
      account_status: privateRecord.account_status ?? null,
    }, origin);
  } catch (error) {
    const origin = req.headers.get('Origin');
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error.',
    }, origin);
  }
});
