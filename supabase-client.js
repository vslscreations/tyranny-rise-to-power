(function () {
  const config = window.TYRANNY_SUPABASE_CONFIG || {};
  const supabaseUrl = config.url;
  const supabaseAnonKey = config.anonKey;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase config is missing. Add the project URL and anon key to supabase-config.js.');
    window.TYRANNY_SUPABASE = null;
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.warn('Supabase client library failed to load. Check the CDN script tag in index.html.');
    window.TYRANNY_SUPABASE = null;
    return;
  }

  window.TYRANNY_SUPABASE = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  window.TYRANNY_SUPABASE.__health = async function () {
    try {
      const { data, error } = await window.TYRANNY_SUPABASE.auth.getSession();
      if (error) {
        console.error('Supabase connection check failed:', error);
        return { ok: false, error };
      }

      return { ok: true, session: data?.session ?? null };
    } catch (error) {
      console.error('Supabase client health check threw:', error);
      return { ok: false, error };
    }
  };

  console.info('Supabase client initialized.');
})();
