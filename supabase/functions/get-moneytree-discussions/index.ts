import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const allowedOrigins = new Set([
  'http://127.0.0.1:5500',
  'http://localhost:4173',
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

const rejectCitizenIdParameters = async (req: Request): Promise<Response | null> => {
  const url = new URL(req.url);
  const forbiddenQueryKeys = ['citizen_id', 'citizenId', 'id'];

  if (forbiddenQueryKeys.some((key) => url.searchParams.has(key))) {
    return jsonResponse(400, {
      error: 'This endpoint does not accept a citizen ID in query parameters.',
    }, req.headers.get('Origin'));
  }

  if (req.method !== 'GET') {
    try {
      const bodyText = await req.clone().text();
      if (!bodyText) {
        return null;
      }

      const parsed = JSON.parse(bodyText) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && forbiddenQueryKeys.some((key) => key in parsed)) {
        return jsonResponse(400, {
          error: 'This endpoint does not accept a citizen ID in the request body.',
        }, req.headers.get('Origin'));
      }
    } catch {
      // Ignore bodies that are not JSON, but keep the endpoint strict about unsupported citizen identifiers.
    }
  }

  return null;
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

    if (req.method !== 'GET') {
      return jsonResponse(405, { error: 'Method not allowed.' }, origin);
    }

    const citizenIdGuardResponse = await rejectCitizenIdParameters(req);
    if (citizenIdGuardResponse) {
      return citizenIdGuardResponse;
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
      return jsonResponse(500, {
        error: 'Service unavailable.',
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
      console.error('Discussion list auth lookup failed:', userError ?? 'No user returned.');
      return jsonResponse(401, {
        error: 'Authentication failed.',
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
      console.error('Discussion list citizen lookup failed:', citizenError);
      return jsonResponse(500, {
        error: 'Unable to load discussions.',
      }, origin);
    }

    if (!citizen) {
      return jsonResponse(404, {
        error: 'Citizen record not found.',
      }, origin);
    }

    const { data: discussions, error: discussionError } = await adminClient
      .from('moneytree_discussions')
      .select('id, discussion_type, title, prompt, profession_gate, created_at, question_category, question_category_priority, sort_order')
      .eq('is_active', true)
      .order('question_category_priority', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (discussionError) {
      console.error('Discussion list lookup failed:', discussionError);
      return jsonResponse(500, {
        error: 'Unable to load discussions.',
      }, origin);
    }

    return jsonResponse(200, {
      discussions: (discussions ?? []).map((discussion) => ({
        id: discussion.id,
        discussion_type: discussion.discussion_type,
        title: discussion.title,
        prompt: discussion.prompt,
        profession_gate: discussion.profession_gate ?? null,
        created_at: discussion.created_at,
      })),
    }, origin);
  } catch (error) {
    const origin = req.headers.get('Origin');
    console.error('Unexpected discussion list error:', error);
    return jsonResponse(500, {
      error: 'Unable to load discussions.',
    }, origin);
  }
});
