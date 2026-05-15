import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { email } = await req.json()
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email required' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    await supabase.from('otp_codes').delete().eq('email', email)
    const { error: insertError } = await supabase.from('otp_codes').insert({ email, otp, expires_at: expiresAt })
    if (insertError) throw insertError

    const transporter = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOST'),
      port: parseInt(Deno.env.get('SMTP_PORT') || '587'),
      secure: false,
      auth: {
        user: Deno.env.get('SMTP_USER'),
        pass: Deno.env.get('SMTP_PASS'),
      },
    })

    await transporter.sendMail({
      from: `"Expense Tracker" <${Deno.env.get('SMTP_USER')}>`,
      to: email,
      subject: 'Expense Tracker — Your verification code',
      html: `
        <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
          <h2 style="color:#111;margin:0 0 8px;">Your verification code</h2>
          <p style="color:#555;margin:0 0 24px;font-size:14px;">Use this code to reset your password. Expires in 10 minutes.</p>
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:28px;text-align:center;margin-bottom:24px;">
            <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#111;">${otp}</span>
          </div>
          <p style="color:#aaa;font-size:12px;margin:0;">Do not share this code. If you didn't request this, ignore this email.</p>
        </div>
      `,
    })

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
