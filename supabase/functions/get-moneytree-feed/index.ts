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

const isUuid = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

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
      // Ignore non-JSON requests while keeping the endpoint strict about unsupported citizen identifiers.
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

    const requestUrl = new URL(req.url);
    const discussionId = requestUrl.searchParams.get('discussion_id');

    if (!isUuid(discussionId)) {
      return jsonResponse(400, {
        error: 'A valid discussion_id query parameter is required.',
      }, origin);
    }

    const accessToken = authHeader.replace(/^Bearer\s+/i, '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const secretKey = getDefaultValueFromJsonConfig(
      Deno.env.get('SUPABASE_SECRET_KEYS'),
    ) ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !secretKey) {
      return jsonResponse(500, {
        error: 'Service unavailable.',
      }, origin);
    }

    const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? secretKey, {
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
      console.error('MoneyTree feed auth lookup failed:', userError ?? 'No user returned.');
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
      console.error('MoneyTree feed citizen lookup failed:', citizenError);
      return jsonResponse(500, {
        error: 'Unable to load discussion feed.',
      }, origin);
    }

    if (!citizen) {
      return jsonResponse(404, {
        error: 'Citizen record not found.',
      }, origin);
    }

    const { data: discussion, error: discussionError } = await adminClient
      .from('moneytree_discussions')
      .select('id, is_active')
      .eq('id', discussionId)
      .maybeSingle();

    if (discussionError) {
      console.error('MoneyTree feed discussion lookup failed:', discussionError);
      return jsonResponse(500, {
        error: 'Unable to load discussion feed.',
      }, origin);
    }

    if (!discussion || !discussion.is_active) {
      return jsonResponse(404, {
        error: 'Discussion not found or inactive.',
      }, origin);
    }

    const MAX_FEED_ROWS = 2000;
    const PAGE_SIZE = 250;
    const pagination = [] as Array<Record<string, unknown>>;
    let offset = 0;
    let moreRows = true;

    while (moreRows) {
      const { data, error } = await adminClient
        .from('moneytree_contributions')
        .select('id, citizen_id, discussion_id, contribution_type, parent_contribution_id, content, created_at, moderation_state')
        .eq('discussion_id', discussionId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error('MoneyTree feed contribution lookup failed:', error);
        return jsonResponse(500, {
          error: 'Unable to load discussion feed.',
        }, origin);
      }

      const pageRows = Array.isArray(data) ? data : [];
      if (pageRows.length === 0) {
        moreRows = false;
        break;
      }

      pagination.push(...pageRows);

      if (pagination.length > MAX_FEED_ROWS) {
        return jsonResponse(413, {
          error: 'Discussion feed is too large for a single response.',
        }, origin);
      }

      if (pageRows.length < PAGE_SIZE) {
        moreRows = false;
        break;
      }

      offset += pageRows.length;
    }

    const rows = pagination;
    const rejectedBranchIds = new Set<string>();
    const rejectedRoots = rows
      .filter((row) => row.moderation_state === 'rejected')
      .map((row) => String(row.id));

    const stack = [...rejectedRoots];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (!currentId || rejectedBranchIds.has(currentId)) {
        continue;
      }

      rejectedBranchIds.add(currentId);
      rows.filter((row) => String(row.parent_contribution_id) === currentId).forEach((row) => {
        stack.push(String(row.id));
      });
    }

    const feedItems = rows
      .filter((row) => ['pending', 'approved'].includes(row.moderation_state))
      .filter((row) => !rejectedBranchIds.has(String(row.id)))
      .map((row) => ({
        id: row.id,
        discussion_id: row.discussion_id,
        citizen_id: row.citizen_id,
        contribution_type: row.contribution_type,
        parent_contribution_id: row.parent_contribution_id ?? null,
        content: row.content,
        created_at: row.created_at,
        moderation_state: row.moderation_state,
      }));

    return jsonResponse(200, {
      discussion_id: discussion.id,
      contributions: feedItems,
    }, origin);
  } catch (error) {
    const origin = req.headers.get('Origin');
    console.error('Unexpected MoneyTree feed error:', error);
    return jsonResponse(500, {
      error: 'Unable to load discussion feed.',
    }, origin);
  }
});
