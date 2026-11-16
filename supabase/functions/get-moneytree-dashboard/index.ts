import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const allowedOrigins = new Set([
  'http://127.0.0.1:5500',
  'http://localhost:4173',
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

const mapModerationState = (state: string | null | undefined): string => {
  switch (state) {
    case 'pending':
      return 'Awaiting Review';
    case 'approved':
      return 'Cleared';
    case 'rejected':
      return 'Not Approved';
    default:
      return 'Unknown';
  }
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
      console.error('Dashboard auth lookup failed:', userError ?? 'No user returned.');
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
      .select('id, citizen_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (citizenError && citizenError.code !== 'PGRST116') {
      console.error('Dashboard citizen lookup failed:', citizenError);
      return jsonResponse(500, {
        error: 'Unable to load dashboard data.',
      }, origin);
    }

    if (!citizen) {
      return jsonResponse(404, {
        error: 'Citizen record not found.',
      }, origin);
    }

    const { data: privateRecord, error: privateError } = await adminClient
      .from('citizen_private')
      .select('balance')
      .eq('citizen_id', citizen.id)
      .maybeSingle();

    if (privateError && privateError.code !== 'PGRST116') {
      console.error('Dashboard private citizen lookup failed:', privateError);
      return jsonResponse(500, {
        error: 'Unable to load dashboard data.',
      }, origin);
    }

    if (!privateRecord) {
      return jsonResponse(404, {
        error: 'Citizen private record not found.',
      }, origin);
    }

    const { count: pendingCount, error: pendingCountError } = await adminClient
      .from('moneytree_contributions')
      .select('*', { count: 'exact', head: true })
      .eq('citizen_id', citizen.id)
      .eq('moderation_state', 'pending');

    if (pendingCountError) {
      console.error('Dashboard pending count lookup failed:', pendingCountError);
      return jsonResponse(500, {
        error: 'Unable to load dashboard data.',
      }, origin);
    }

    const { data: contributionRows, error: contributionError } = await adminClient
      .from('moneytree_contributions')
      .select('id, discussion_id, contribution_type, created_at, moderation_state, moneytree_discussions(title)')
      .eq('citizen_id', citizen.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (contributionError) {
      console.error('Dashboard contribution lookup failed:', contributionError);
      return jsonResponse(500, {
        error: 'Unable to load dashboard data.',
      }, origin);
    }

    const contributions = contributionRows ?? [];
    const activityContributionIds = contributions
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const rewardRows = activityContributionIds.length > 0
      ? await adminClient
        .from('moneytree_reward_ledger')
        .select('contribution_key, amount')
        .eq('citizen_id', citizen.id)
        .in('contribution_key', activityContributionIds)
      : { data: [], error: null };

    if (rewardRows.error) {
      console.error('Dashboard reward lookup failed:', rewardRows.error);
      return jsonResponse(500, {
        error: 'Unable to load dashboard data.',
      }, origin);
    }

    const rewardMap = new Map<string, number>();
    for (const reward of rewardRows.data ?? []) {
      const contributionKey = typeof reward.contribution_key === 'string' ? reward.contribution_key : null;
      const numericAmount = Number(reward.amount ?? 0);
      if (contributionKey && Number.isFinite(numericAmount)) {
        rewardMap.set(contributionKey, numericAmount);
      }
    }

    const discussionActivity = contributions.map((entry) => {
      const moderationState = typeof entry.moderation_state === 'string' ? entry.moderation_state : 'pending';
      const rewardAmount = moderationState === 'approved'
        ? rewardMap.get(String(entry.id)) ?? null
        : null;

      const discussionRecord = (entry as { moneytree_discussions?: { title?: string | null } } | null)?.moneytree_discussions;
      const discussionTitle = discussionRecord?.title ?? 'Unknown discussion';

      return {
        contribution_id: entry.id,
        discussion_id: entry.discussion_id,
        discussion_title: discussionTitle,
        contribution_type: entry.contribution_type ?? null,
        contribution_date: entry.created_at ?? null,
        moderation_state: moderationState,
        moderation_label: mapModerationState(moderationState),
        reward_amount: rewardAmount,
      };
    });

    return jsonResponse(200, {
      available_balance: privateRecord.balance ?? 0,
      pending_earnings: (pendingCount ?? 0) * 10,
      discussion_activity: discussionActivity,
    }, origin);
  } catch (error) {
    const origin = req.headers.get('Origin');
    console.error('Unexpected dashboard error:', error);
    return jsonResponse(500, {
      error: 'Unable to load dashboard data.',
    }, origin);
  }
});
