import { useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type PermissionStatus = 'idle' | 'granted' | 'denied' | 'unsupported';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array(Array.from(rawData).map((c) => c.charCodeAt(0)));
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

async function subscribeToPush(reg: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });
  } catch {
    return null;
  }
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  const keys = json.keys as { p256dh: string; auth: string };
  await supabase.from('push_subscriptions').upsert(
    { endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: 'endpoint' }
  );
}

/**
 * Hook que gestiona:
 * 1. Registro del Service Worker
 * 2. Suscripción a Web Push (notificaciones nativas aunque la app esté cerrada)
 * 3. Fallback de beep por Web Audio API (cuando el browser está abierto)
 */
export function useKitchenNotifications() {
  const [permission, setPermission] = useState<PermissionStatus>(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return 'idle';
  });
  const permissionRef = useRef<PermissionStatus>(permission);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const requestPermission = useCallback(async () => {
    // 1. Activar AudioContext con gesto del usuario
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
    } catch (_) {}

    // 2. Verificar soporte
    if (typeof Notification === 'undefined') {
      setPermission('unsupported');
      permissionRef.current = 'unsupported';
      return;
    }

    // 3. Si ya fue denegado
    if (Notification.permission === 'denied') {
      setPermission('denied');
      permissionRef.current = 'denied';
      alert('Las notificaciones están bloqueadas. Habilítalas en el 🔒 candado de la barra de direcciones.');
      return;
    }

    // 4. Pedir permiso
    let result: NotificationPermission = Notification.permission;
    if (result !== 'granted') {
      result = await Notification.requestPermission();
    }

    if (result !== 'granted') {
      setPermission('denied');
      permissionRef.current = 'denied';
      return;
    }

    setPermission('granted');
    permissionRef.current = 'granted';

    // 5. Registrar SW y suscribir a Web Push
    try {
      const reg = await registerServiceWorker();
      if (reg && VAPID_PUBLIC_KEY) {
        const sub = await subscribeToPush(reg);
        if (sub) await saveSubscription(sub);
      }
    } catch (_) {}
  }, []);

  /** Beep de dos tonos — fallback cuando el browser está abierto y en foco */
  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const play = (freq: number, start: number, dur: number, type: OscillatorType, vol: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(vol, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      play(880, 0, 0.5, 'sine', 0.5);
      play(1108.73, 0.1, 0.5, 'triangle', 0.4);
    } catch (_) {}
  }, []);

  /**
   * Cuando llega un nuevo pedido (desde Supabase Realtime en el browser abierto):
   * - Muestra notificación nativa via SW (si está registrado)
   * - Emite el beep de audio como respaldo inmediato
   */
  const notifyNewOrder = useCallback((titulo: string, cuerpo: string) => {
    playBeep();
    if (permissionRef.current !== 'granted') return;
    try {
      // Fallback: notificación directa si el SW no está disponible
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        new Notification(titulo, { body: cuerpo, icon: '/icon-192.png', tag: 'nuevo-pedido' });
      }
      // Si hay SW, él recibirá el push desde el servidor automáticamente
    } catch (_) {}
  }, [playBeep]);

  return { permission, requestPermission, playBeep, notifyNewOrder };
}
