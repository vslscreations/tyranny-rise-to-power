import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const allowedOrigins = new Set([
  'http://127.0.0.1:5500',
  'http://localhost:8000',
  'http://localhost:3000',
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

    if (req.method !== 'GET' && req.method !== 'POST') {
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
      'SUPABASE_PUBLISHABLE_KEYS',
    ) ?? Deno.env.get('SUPABASE_ANON_KEY');
    const secretKey = getDefaultValueFromJsonConfig(
      Deno.env.get('SUPABASE_SECRET_KEYS'),
      'SUPABASE_SECRET_KEYS',
    ) ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !publishableKey || !secretKey) {
      return jsonResponse(500, {
        error: 'Store quote service is missing required configuration.',
      }, origin);
    }

    let payload: Record<string, unknown> = {};
    if (req.method === 'GET') {
      const url = new URL(req.url);
      payload = {
        product_id: url.searchParams.get('product_id') ?? url.searchParams.get('productId'),
        quantity: url.searchParams.get('quantity') ?? '1',
      };
    } else {
      payload = await req.json().catch(() => ({}));
    }

    const productId = typeof payload.product_id === 'string' ? payload.product_id : typeof payload.productId === 'string' ? payload.productId : null;
    const quantityRaw = typeof payload.quantity === 'number' ? payload.quantity : Number(payload.quantity ?? '1');
    const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 0;

    if (!productId) {
      return jsonResponse(400, { error: 'Product id is required.' }, origin);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return jsonResponse(400, { error: 'Quantity must be greater than zero.' }, origin);
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
        error: 'Authenticated citizen record not found.',
      }, origin);
    }

    const { data: product, error: productError } = await adminClient
      .from('store_catalog')
      .select('id, product_name, product_key, price, currency, category_id, is_visible, is_locked, is_purchasable, one_time_purchase')
      .eq('id', productId)
      .maybeSingle();

    if (productError) {
      return jsonResponse(500, {
        error: productError.message,
      }, origin);
    }

    if (!product) {
      return jsonResponse(404, {
        error: 'Product not found.',
      }, origin);
    }

    const { data: category, error: categoryError } = await adminClient
      .from('store_categories')
      .select('id, is_visible, is_locked')
      .eq('id', product.category_id)
      .maybeSingle();

    if (categoryError) {
      return jsonResponse(500, {
        error: categoryError.message,
      }, origin);
    }

    if (!category) {
      return jsonResponse(404, {
        error: 'Product category not found.',
      }, origin);
    }

    if (!product.is_visible || product.is_locked || !product.is_purchasable || !category.is_visible || category.is_locked) {
      return jsonResponse(409, {
        error: 'Product is unavailable for purchase.',
      }, origin);
    }

    if (product.price === null || product.price === undefined) {
      return jsonResponse(409, {
        error: 'Product price is not available.',
      }, origin);
    }

    if (product.currency !== 'USD') {
      return jsonResponse(409, {
        error: 'Only USD purchases are supported.',
      }, origin);
    }

    if (product.one_time_purchase && quantity !== 1) {
      return jsonResponse(409, {
        error: 'One-time purchase products require a quantity of 1.',
      }, origin);
    }

    const { data: activeSettings, error: settingsError } = await adminClient
      .from('economic_settings')
      .select('tax_rate')
      .eq('active', true);

    if (settingsError) {
      return jsonResponse(500, {
        error: settingsError.message,
      }, origin);
    }

    if (!Array.isArray(activeSettings) || activeSettings.length !== 1 || activeSettings[0]?.tax_rate == null) {
      return jsonResponse(409, {
        error: 'National sales tax is not configured for checkout.',
      }, origin);
    }

    const taxRate = Number(activeSettings[0].tax_rate);
    const itemPrice = Number(product.price);
    const subtotal = Number((itemPrice * quantity).toFixed(2));
    const taxAmount = Number((subtotal * taxRate).toFixed(2));
    const finalTotal = Number((subtotal + taxAmount).toFixed(2));

    let eligibility = {
      is_eligible: true,
      required_approved_contributions: 0,
      approved_contributions: 0,
      remaining_required: 0,
      message: 'No purchase eligibility requirement.',
    };

    if (product.product_key === 'high_school_diploma') {
      const requiredApprovedContributions = 200;
      const { count, error: approvedError } = await adminClient
        .from('moneytree_contributions')
        .select('id', { count: 'exact', head: true })
        .eq('citizen_id', citizen.id)
        .eq('moderation_state', 'approved');

      if (approvedError) {
        return jsonResponse(500, {
          error: approvedError.message,
        }, origin);
      }

      const approvedCount = Number(count ?? 0);
      const remainingRequired = Math.max(0, requiredApprovedContributions - approvedCount);
      eligibility = {
        is_eligible: approvedCount >= requiredApprovedContributions,
        required_approved_contributions: requiredApprovedContributions,
        approved_contributions: approvedCount,
        remaining_required: remainingRequired,
        message: approvedCount >= requiredApprovedContributions
          ? 'Eligible for this item.'
          : `Requires ${remainingRequired} more approved MoneyTree contribution${remainingRequired === 1 ? '' : 's'} before purchase is allowed.`,
      };
    }

    return jsonResponse(200, {
      product_id: product.id,
      product_name: product.product_name,
      item_price: itemPrice,
      quantity,
      currency: product.currency,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      final_total: finalTotal,
      eligibility,
    }, origin);
  } catch (error) {
    const origin = req.headers.get('Origin');
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error.',
    }, origin);
  }
});
