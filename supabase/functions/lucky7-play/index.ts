/// <reference path="./deno.d.ts" />

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
};

const jsonResponse = (status: number, payload: Record<string, unknown>, origin: string | null = null) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin),
    } as Record<string, string>,
  });

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

    if (req.method !== 'POST') {
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
      return jsonResponse(500, { error: 'LUCKY 7 is missing Supabase configuration.' }, origin);
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
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

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse(401, {
        error: userError?.message ?? 'User authentication failed.',
      }, origin);
    }

    const payload = await req.json().catch(() => ({}));
    const gameType = typeof payload.game_type === 'string' ? payload.game_type.trim().toLowerCase() : '';
    const wager = Number(payload.wager ?? 0);
    const idempotencyKey = typeof payload.idempotency_key === 'string' && payload.idempotency_key.trim()
      ? payload.idempotency_key.trim()
      : `${user.id}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const incomingPayload = payload.payload && typeof payload.payload === 'object' ? payload.payload : {};
    const normalizedPayload = (() => {
      if (gameType === 'roulette' && Array.isArray(incomingPayload.bets)) {
        return {
          ...incomingPayload,
          bets: incomingPayload.bets.map((bet) => ({
            type: typeof bet?.type === 'string' ? bet.type.trim().toLowerCase() : '',
            wager: Number(bet?.wager ?? bet?.amount ?? 0),
          })).filter((bet) => bet.type && Number.isFinite(bet.wager) && bet.wager > 0),
        };
      }

      if (gameType === 'baccarat') {
        const rawBet = typeof incomingPayload.bet === 'string' ? incomingPayload.bet.trim().toLowerCase() : '';
        return {
          ...incomingPayload,
          bet: rawBet,
        };
      }

      return incomingPayload;
    })();

    if (!['slots', 'roulette', 'blackjack', 'baccarat'].includes(gameType)) {
      return jsonResponse(400, { error: 'Unsupported game type.' }, origin);
    }

    if (!Number.isFinite(wager) || wager < 1 || wager > 500) {
      return jsonResponse(400, { error: 'Wager must be between $1 and $500.' }, origin);
    }

    if (gameType === 'roulette' && Array.isArray(normalizedPayload.bets) && normalizedPayload.bets.length === 0) {
      return jsonResponse(400, { error: 'Roulette requires at least one active bet.' }, origin);
    }

    if (gameType === 'baccarat') {
      const selectedBet = typeof normalizedPayload.bet === 'string' ? normalizedPayload.bet.trim().toLowerCase() : '';
      if (!['player', 'banker', 'tie'].includes(selectedBet)) {
        return jsonResponse(400, { error: 'Baccarat requires a valid Player, Banker, or Tie bet.' }, origin);
      }
    }

    const { data, error } = await userClient.rpc('process_lucky7_game', {
      p_game_type: gameType,
      p_wager: wager,
      p_idempotency_key: idempotencyKey,
      p_payload: normalizedPayload,
    });

    if (error) {
      return jsonResponse(400, {
        error: error.message,
      }, origin);
    }

    const result = Array.isArray(data) ? data[0] : data;
    return jsonResponse(200, {
      transaction: result,
    }, origin);
  } catch (error) {
    console.error('LUCKY 7 play function failed:', error);
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'LUCKY 7 play could not complete.',
    }, null);
  }
});
