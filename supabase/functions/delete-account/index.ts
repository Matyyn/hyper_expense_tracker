import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  console.log('[delete-account] request received', req.method)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    console.error('[delete-account] no auth header')
    return json({ error: 'Missing Authorization header' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  console.log('[delete-account] verifying user...')
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    console.error('[delete-account] auth error:', authError?.message)
    return json({ error: `Auth failed: ${authError?.message ?? 'no user'}` }, 401)
  }
  console.log('[delete-account] user verified:', user.id)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('[delete-account] deleting expenses...')
  const { error: e1 } = await admin.from('expenses').delete().eq('user_id', user.id)
  if (e1) console.error('[delete-account] expenses delete error:', e1.message)

  console.log('[delete-account] deleting quick_templates...')
  const { error: e2 } = await admin.from('quick_templates').delete().eq('user_id', user.id)
  if (e2) console.error('[delete-account] templates delete error:', e2.message)

  console.log('[delete-account] deleting categories...')
  const { error: e3 } = await admin.from('categories').delete().eq('user_id', user.id)
  if (e3) console.error('[delete-account] categories delete error:', e3.message)

  console.log('[delete-account] deleting profile...')
  const { error: e4 } = await admin.from('profiles').delete().eq('id', user.id)
  if (e4) console.error('[delete-account] profile delete error:', e4.message)

  console.log('[delete-account] deleting auth user...')
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    console.error('[delete-account] deleteUser error:', deleteError.message)
    return json({ error: `deleteUser failed: ${deleteError.message}` }, 500)
  }

  console.log('[delete-account] success, user deleted:', user.id)
  return json({ success: true })
})
