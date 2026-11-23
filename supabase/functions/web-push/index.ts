import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const origins = new Set(['https://vslscreations.github.io', 'http://localhost:8000', 'http://localhost:3000', 'http://127.0.0.1:5500']);
// Restrict outbound push requests to known browser push services; never fetch an arbitrary URL.
function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      (u.hostname === 'fcm.googleapis.com' || u.hostname === 'updates.push.services.mozilla.com' ||
       u.hostname === 'web.push.apple.com' || u.hostname.endsWith('.push.apple.com') ||
       u.hostname.endsWith('.notify.windows.com'));
  } catch { return false; }
}
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const headers: Record<string,string> = { 'Content-Type': 'application/json', 'Vary': 'Origin' };
  if (origins.has(origin)) Object.assign(headers, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {status, headers});
  if (req.method === 'OPTIONS') return reply(origins.has(origin) ? 200 : 403, {});
  if (req.method !== 'POST') return reply(405, {error:'Method not allowed'});
  const publicKey = Deno.env.get('WEB_PUSH_PUBLIC_KEY');
  const privateKey = Deno.env.get('WEB_PUSH_PRIVATE_KEY');
  if (!publicKey || !privateKey) return reply(503, {error:'Phone notifications are not configured yet.'});
  try {
    const db = admin();
    const workerSecret = Deno.env.get('WEB_PUSH_WORKER_SECRET');
    if (workerSecret && req.headers.get('x-push-worker-secret') === workerSecret) {
      const {data: jobs, error} = await db.rpc('claim_web_push');
      if (error) throw error;
      webpush.setVapidDetails('https://vslscreations.github.io/tyranny-rise-to-power/', publicKey, privateKey);
      let delivered = 0;
      // Bounded concurrency keeps each scheduled invocation within its time limit.
      for (let i=0; i<(jobs || []).length; i+=8) {
        await Promise.all(jobs.slice(i,i+8).map(async (job: any) => {
          let status = 0;
          try {
            if (!validEndpoint(job.endpoint)) { status=410; }
            else {
              const result = await webpush.sendNotification({
                endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth},
              }, JSON.stringify({id:job.notification_id}), {TTL:3600,urgency:'normal',timeout:7000});
              status=result.statusCode;
            }
          } catch (error) { status=Number(error.statusCode || 0); }
          if (status===404 || status===410) {
            const result=await db.from('web_push_subscriptions').delete().eq('id',job.subscription_id);
            if(result.error) throw result.error;
          } else {
            const ok=status>=200 && status<300;
            const result=await db.from('web_push_deliveries').update({
              delivered_at:ok?new Date().toISOString():null,last_status:status,
            }).eq('id',job.id);
            if(result.error) throw result.error;
            if(ok) delivered++;
          }
        }));
      }
      return reply(200,{processed:(jobs || []).length,delivered});
    }
    if (!origins.has(origin)) return reply(403,{error:'Origin not allowed'});
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
    if (!token) return reply(401,{error:'Sign in first'});
    const {data:{user},error:authError}=await db.auth.getUser(token);
    if(authError || !user) return reply(401,{error:'Sign in first'});
    const {data:citizen,error:citizenError}=await db.from('citizens').select('id').eq('auth_user_id',user.id).maybeSingle();
    if(citizenError || !citizen) return reply(403,{error:'Citizen account required'});
    const body=await req.json();
    if(body.action==='config') return reply(200,{publicKey});
    if(!validEndpoint(body.endpoint)) return reply(400,{error:'Unsupported push service'});
    if(body.action==='disable') {
      const {error}=await db.from('web_push_subscriptions').delete().eq('endpoint',body.endpoint).eq('citizen_id',citizen.id);
      if(error) throw error;
      return reply(200,{enabled:false});
    }
    if(body.action==='enable') {
      if(!/^[A-Za-z0-9_-]{87}$/.test(body.keys?.p256dh || '') || !/^[A-Za-z0-9_-]{22}$/.test(body.keys?.auth || ''))
        return reply(400,{error:'Invalid subscription keys'});
      const {error}=await db.rpc('register_web_push',{
        p_citizen:citizen.id,p_endpoint:body.endpoint,p_p256dh:body.keys.p256dh,p_auth:body.keys.auth,
      });
      if(error) throw error;
      return reply(200,{enabled:true});
    }
    return reply(400,{error:'Unknown action'});
  } catch {
    // Do not log endpoints, cryptographic keys, tokens, or message content.
    return reply(500,{error:'Phone notifications could not be updated. Please retry.'});
  }
});
