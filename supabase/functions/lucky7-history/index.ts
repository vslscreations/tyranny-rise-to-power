import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const allowedOrigins = new Set([
  'http://127.0.0.1:5500',
  'http://localhost:8000',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://192.168.0.191:4173',
  'https://vslscreations.github.io',
]);

const getCorsHeaders = (origin: string | null): Record<string, string> => {
  const requestOrigin = typeof origin === 'string' ? origin.trim() : '';

  if (!allowedOrigins.has(requestOrigin)) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': requestOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
};

const getDefaultValueFromJsonConfig = (rawValue: string | undefined) => {
  if (!rawValue) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    const value = typeof parsed?.default === 'string' ? parsed.default : undefined;
    return value || undefined;
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

    if (req.method !== 'GET') {
      return jsonResponse(405, { error: 'Method not allowed.' }, origin);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return jsonResponse(401, { error: 'Missing bearer token.' }, origin);
    }

    const accessToken = authHeader.replace(/^Bearer\s+/i, '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = getDefaultValueFromJsonConfig(
      Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
    ) ?? Deno.env.get('SUPABASE_ANON_KEY');
    const secretKey = getDefaultValueFromJsonConfig(
      Deno.env.get('SUPABASE_SECRET_KEYS'),
    ) ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !publishableKey || !secretKey) {
      return jsonResponse(500, { error: 'LUCKY 7 history is missing Supabase configuration.' }, origin);
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
      return jsonResponse(401, { error: 'Authentication failed.' }, origin);
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
      return jsonResponse(500, { error: citizenError.message }, origin);
    }

    if (!citizen) {
      return jsonResponse(404, { error: 'Citizen record not found.' }, origin);
    }

    const { data: allRows, error: statsError } = await adminClient
      .from('lucky7_transaction_history')
      .select('wager, payout, net_change')
      .eq('citizen_id', citizen.id);

    if (statsError) {
      return jsonResponse(500, { error: statsError.message }, origin);
    }

    const totalBet = (allRows ?? []).reduce((sum, row) => sum + Number(row?.wager ?? 0), 0);
    const totalWin = (allRows ?? []).reduce((sum, row) => sum + Number(row?.payout ?? 0), 0);

    const { data: transactions, error: transactionsError } = await adminClient
      .from('lucky7_transaction_history')
      .select('id, game_type, wager, payout, net_change, balance_after, status, result, created_at')
      .eq('citizen_id', citizen.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (transactionsError) {
      return jsonResponse(500, { error: transactionsError.message }, origin);
    }

    return jsonResponse(200, {
      transactions: transactions ?? [],
      stats: {
        total_bet: totalBet,
        total_win: totalWin,
        net_profit: totalWin - totalBet,
      },
    }, origin);
  } catch (error) {
    console.error('LUCKY 7 history failed:', error);
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unable to load the LUCKY 7 history.',
    }, null);
  }
});
