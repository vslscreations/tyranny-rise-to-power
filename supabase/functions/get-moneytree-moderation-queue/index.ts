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
      return jsonResponse(401, {
        error: 'Authentication failed.',
      }, origin);
    }

    const serviceClient = createClient(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // Protected moderator-only reads are intentionally performed with the service-role client
    // after the authenticated citizen has been verified against public.moneytree_moderators.
    const { data: citizen, error: citizenError } = await serviceClient
      .from('citizens')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (citizenError && citizenError.code !== 'PGRST116') {
      console.error('Moderator queue citizen lookup failed:', citizenError);
      return jsonResponse(500, {
        error: 'Unable to load the moderation queue.',
      }, origin);
    }

    if (!citizen) {
      return jsonResponse(404, {
        error: 'Citizen record not found.',
      }, origin);
    }

    const { data: moderator, error: moderatorError } = await serviceClient
      .from('moneytree_moderators')
      .select('citizen_id')
      .eq('citizen_id', citizen.id)
      .maybeSingle();

    if (moderatorError && moderatorError.code !== 'PGRST116') {
      console.error('Moderator queue access lookup failed:', moderatorError);
      return jsonResponse(500, {
        error: 'Unable to verify moderator authorization.',
      }, origin);
    }

    if (!moderator) {
      return jsonResponse(403, {
        error: 'Moderator access required.',
      }, origin);
    }

    const { data: pendingContributions, error: contributionError } = await serviceClient
      .from('moneytree_contributions')
      .select('id, citizen_id, discussion_id, parent_contribution_id, contribution_type, content, created_at, moderation_state')
      .eq('moderation_state', 'pending')
      .order('created_at', { ascending: false });

    if (contributionError) {
      console.error('Moderator queue contribution lookup failed:', contributionError);
      return jsonResponse(500, {
        error: 'Unable to load the moderation queue.',
      }, origin);
    }

    const contributionRows = pendingContributions ?? [];
    const discussionIds = [...new Set(contributionRows.map((entry) => entry.discussion_id).filter(Boolean))];
    const contributorIds = [...new Set(contributionRows.map((entry) => entry.citizen_id).filter(Boolean))];
    const parentContributionIds = [...new Set(
      contributionRows
        .map((entry) => entry.parent_contribution_id)
        .filter((id): id is string => typeof id === 'string' && Boolean(id.trim())),
    )];

    const [discussionResult, citizenResult, parentContributionResult] = await Promise.all([
      discussionIds.length > 0
        ? serviceClient
            .from('moneytree_discussions')
            .select('id, title, discussion_type, prompt')
            .in('id', discussionIds)
        : Promise.resolve({ data: [], error: null }),
      contributorIds.length > 0
        ? serviceClient
            .from('citizens')
            .select('id, public_name')
            .in('id', contributorIds)
        : Promise.resolve({ data: [], error: null }),
      parentContributionIds.length > 0
        ? serviceClient
            .from('moneytree_contributions')
            .select('id, content')
            .in('id', parentContributionIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (discussionResult.error) {
      console.error('Moderator queue discussion lookup failed:', discussionResult.error);
      return jsonResponse(500, {
        error: 'Unable to load the moderation queue.',
      }, origin);
    }

    if (citizenResult.error) {
      console.error('Moderator queue contributor lookup failed:', citizenResult.error);
      return jsonResponse(500, {
        error: 'Unable to load the moderation queue.',
      }, origin);
    }

    if (parentContributionResult.error) {
      console.error('Moderator queue parent contribution lookup failed:', parentContributionResult.error);
      return jsonResponse(500, {
        error: 'Unable to load the moderation queue.',
      }, origin);
    }

    const discussionMap = new Map((discussionResult.data ?? []).map((entry) => [entry.id, entry]));
    const citizenMap = new Map((citizenResult.data ?? []).map((entry) => [entry.id, entry]));
    const parentContributionMap = new Map((parentContributionResult.data ?? []).map((entry) => [entry.id, entry]));

    const pendingQueue = contributionRows.map((contribution) => {
      const discussion = discussionMap.get(contribution.discussion_id) ?? null;
      const contributor = citizenMap.get(contribution.citizen_id) ?? null;
      const parentContext = contribution.parent_contribution_id
        ? parentContributionMap.get(contribution.parent_contribution_id)?.content ?? 'No parent contribution context available.'
        : 'No parent contribution context — this is a root contribution.';

      return {
        id: contribution.id,
        discussion_id: contribution.discussion_id,
        discussion_title: discussion?.title ?? 'Unknown discussion',
        discussion_prompt: discussion?.prompt ?? '',
        discussion_type: discussion?.discussion_type ?? 'question',
        contribution_type: contribution.contribution_type ?? 'question_answer',
        contributor_citizen_id: contribution.citizen_id ?? null,
        contributor_public_name: contributor?.public_name ?? 'Citizen',
        parent_contribution_context: parentContext,
        content: typeof contribution.content === 'string' ? contribution.content : '',
        created_at: contribution.created_at,
      };
    });

    return jsonResponse(200, {
      pending_contributions: pendingQueue,
    }, origin);
  } catch (error) {
    console.error('Unexpected moderator queue error:', error);
    return jsonResponse(500, {
      error: 'Unable to load the moderation queue.',
    }, null);
  }
});
