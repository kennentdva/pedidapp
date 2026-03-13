import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import webpush from 'npm:web-push@3.6.7';

// Estas variables se configuran como Supabase Secrets:
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_MAILTO
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_MAILTO = Deno.env.get('VAPID_MAILTO') ?? 'mailto:admin@pedidapp.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

serve(async (req) => {
  try {
    const payload = await req.json();
    // payload viene del database webhook: { type: 'INSERT', record: { ... } }
    const pedido = payload.record ?? payload;
    const beneficiario = pedido.beneficiario ?? 'Cliente';
    const detalle = pedido.detalle;
    let descripcion = '';
    if (detalle?.items?.length) {
      descripcion = `${detalle.items.length} ítems`;
    } else if (detalle?.proteina) {
      descripcion = detalle.proteina;
    }

    const pushPayload = JSON.stringify({
      title: '🍽️ Nuevo Pedido',
      body: `${beneficiario}${descripcion ? ' — ' + descripcion : ''}`,
      url: '/cocina',
    });

    // Obtener todas las suscripciones activas
    const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const subscriptions: Array<{ endpoint: string; p256dh: string; auth: string }> = await res.json();

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          pushPayload
        )
      )
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    return new Response(JSON.stringify({ sent, failed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
