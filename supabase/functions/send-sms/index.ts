import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// خواندن اطلاعات امنیتی از متغیرهای محیطی (Secrets)
const MELIPAYAMAK_USERNAME = Deno.env.get("MELIPAYAMAK_USERNAME") ?? ""
const MELIPAYAMAK_PASSWORD = Deno.env.get("MELIPAYAMAK_PASSWORD") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  // مدیریت درخواست‌های مقدماتی CORS (Preflight)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { phone, bodyId, text, type = "service_alert" } = await req.json()

    if (!phone || !bodyId) {
      return new Response(
        JSON.stringify({ error: "شماره موبایل و شناسه قالب پیامک الزامی است." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ۱. ارسال پیامک با وب‌سرویس پترن (SendByBaseNumber) ملی‌پیامک
    const meliRes = await fetch("https://rest.payamak-panel.com/api/SendSMS/SendByBaseNumber", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: MELIPAYAMAK_USERNAME,
        password: MELIPAYAMAK_PASSWORD,
        text: text, // متغیرهای قالب (مثلاً نام مشتری یا لینک فاکتور)
        bodyId: Number(bodyId),
        to: phone
      })
    })

    const meliData = await meliRes.json()

    // ۲. ثبت نتیجه در جدول sms_logs به صورت امن با Service Role
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      await supabase.from("sms_logs").insert([
        {
          phone,
          body_id: bodyId,
          params: text,
          type,
          rec_id: meliData.Value ? String(meliData.Value) : null,
          status: meliData.RetStatus === 1 ? "sent" : "failed",
          raw_response: meliData,
          created_at: new Date().toISOString()
        }
      ])
    }

    return new Response(JSON.stringify(meliData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
