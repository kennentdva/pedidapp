import { useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type PermissionStatus = 'idle' | 'granted' | 'denied' | 'unsupported';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const clean = base64String.trim();
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
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
    
    const uint8Key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    
    // Validar que la llave tenga el tamaño correcto (65 bytes para uncompressed EC point)
    if (uint8Key.length !== 65) {
      throw new Error(`Llave VAPID inválida: tamaño esperado 65, se obtuvo ${uint8Key.length}. Revisa Vercel.`);
    }

    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: uint8Key as any
    });
  } catch (err: any) {
    console.error('Error interno de suscripción:', err);
    throw err; // Lanzar el error real para que lo capture el alert de abajo
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

    if (result === 'granted') {
      setPermission('granted');
      permissionRef.current = 'granted';

      // 5. Registrar SW y suscribir a Web Push
      try {
        console.log('Iniciando registro de SW...');
        const reg = await registerServiceWorker();
        if (!reg) {
          throw new Error('No se pudo registrar el Service Worker.');
        }

        // Tocar un sonido de prueba para despertar el AudioContext en este este click
        playBeep();

        if (VAPID_PUBLIC_KEY) {
          console.log('Suscribiendo a Web Push...');
          const sub = await subscribeToPush(reg);
          if (sub) await saveSubscription(sub);
        }
        
        alert('✅ ¡Alertas activadas! Deberías haber escuchado un "beep".');
      } catch (err: any) {
        console.error('Error en registro push:', err);
      }
    }
  }, []);

  /** Reproduce un tono limpio usando AudioContext */
  const playTono = useCallback((freq = 880, dur = 0.3, vol = 0.3) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch (e) {
      console.error("Error al generar tono:", e);
    }
  }, []);

  const playTripleBeep = useCallback(() => {
    playTono(880, 0.2);
    setTimeout(() => playTono(987.77, 0.2), 200);
    setTimeout(() => playTono(1108.73, 0.2), 400);
  }, [playTono]);

  /** Beep de dos tonos — fallback cuando el browser está abierto y en foco */
  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
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

  const speechQueue = useRef<{ text: string, onEnd?: () => void }[]>([]);
  const isSpeaking = useRef(false);
  const currentCallback = useRef<(() => void) | undefined>(undefined);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const processQueue = useCallback(() => {
    if (isSpeaking.current || speechQueue.current.length === 0 || !('speechSynthesis' in window)) return;

    isSpeaking.current = true;
    const item = speechQueue.current.shift()!;
    const utterance = new SpeechSynthesisUtterance(item.text);
    currentCallback.current = item.onEnd;
    
    // Configuración de voz (persistente por sesión/instancia)
    if (!selectedVoiceRef.current) {
      const voices = window.speechSynthesis.getVoices();
      // Priorizar voces femeninas ("Chica") conocidas
      selectedVoiceRef.current = voices.find(v => 
        (v.name.includes('Helena') || v.name.includes('Sabina') || v.name.includes('Lucia') || v.name.includes('Zira') || v.name.includes('Hilda') || v.name.includes('Laura')) && v.lang.includes('es')
      ) || voices.find(v => v.lang.includes('es') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Female') || v.name.includes('Mujer'))) 
        || voices.find(v => v.lang.startsWith('es')) || null;
    }

    if (selectedVoiceRef.current) utterance.voice = selectedVoiceRef.current;
    utterance.lang = 'es-ES';
    utterance.rate = 0.9;
    utterance.pitch = 1;

    utterance.onend = () => {
      if (currentCallback.current) {
        currentCallback.current();
        currentCallback.current = undefined;
      }
      isSpeaking.current = false;
      setTimeout(processQueue, 500); // Pequeña pausa entre mensajes
    };

    utterance.onerror = () => {
      if (currentCallback.current) {
        currentCallback.current();
        currentCallback.current = undefined;
      }
      isSpeaking.current = false;
      processQueue();
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  /** Narrador de voz (TTS) */
  const speakText = useCallback((text: string, onEnd?: () => void) => {
    if (!('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      return;
    }
    speechQueue.current.push({ text, onEnd });
    processQueue();
  }, [processQueue]);

  const speakNewOrder = useCallback((pedido: any) => {
    const beneficiario = pedido.beneficiario || 'un cliente';
    
    // Helper para formatear un ítem individual
    const formatItem = (it: any) => {
      const cant = it.cantidad > 1 ? `${it.cantidad} ` : '';
      let desc = `${cant}${it.proteina}`;
      
      // Media Sopa
      if (it.mediaSopa) desc += ' con media sopa';
      else if (it.sopa) desc += ` con ${it.sopa}`;

      const acc = it.acompanamientos || [];
      // Si es Solo Sopa y tiene Arroz, decirlo
      if (it.proteina === 'Solo Sopa' && acc.includes('Arroz')) {
        desc += ' con Arroz';
      }
      
      // Solo Arroz y Ensalada son "notables" si faltan, ignoramos Papa/Patacón en voz
      const faltantes = [];
      if (it.tipoPlato !== 'arroz' && it.tipoPlato !== 'snack' && it.proteina !== 'Solo Sopa') {
        if (!acc.includes('Arroz')) faltantes.push('Arroz');
        if (!acc.includes('Ensalada')) faltantes.push('Ensalada');
        
        // El acompañante frito (Príncipe)
        const tienePrincipe = acc.some((a: string) => ['Papas', 'Patacón', 'Frijol', 'Yuca', 'Tajadas', 'Maduro'].includes(a));
        if (!tienePrincipe) faltantes.push('acompañante');
      }
      
      // Si no tiene nada (sin arroz, ni ensalada, ni acompañante), decir "Solo [Proteina]"
      if (faltantes.length === 3) {
        return `Solo ${it.proteina}`;
      }
      
      if (faltantes.length > 0) desc += ` sin ${faltantes.join(' ni ')}`;
      return desc;
    };

    let detalleTxt = '';
    if (pedido.detalle?.items && Array.isArray(pedido.detalle.items)) {
      detalleTxt = pedido.detalle.items.map(formatItem).join(', ');
    } else {
      // Fallback para pedidos simples (compatibilidad)
      detalleTxt = formatItem(pedido.detalle);
    }

    speakText(`Nuevo pedido para ${beneficiario}: ${detalleTxt}`);
  }, [speakText]);

  /**
   * Cuando llega un nuevo pedido (desde Supabase Realtime en el browser abierto):
   * - Muestra notificación nativa via SW (si está registrado)
   * - Emite el beep de audio como respaldo inmediato
   */
  const notifyNewOrder = useCallback((titulo: string, cuerpo: string) => {
    // 1. Intentar sonido triple (más fuerte/largo)
    playTripleBeep();
    
    // 2. Narrar el pedido
    // speakText(cuerpo); // This line is replaced by speakNewOrder in the return statement

    // 2. Notificación local si tenemos permiso
    if (permissionRef.current === 'granted') {
      try {
        // Usamos registration.showNotification si existe el SW, es más potente que "new Notification"
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(titulo, {
              body: cuerpo,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: 'nuevo-pedido', // El mismo tag evita duplicados si el servidor envía otro push
              vibrate: [200, 100, 200]
            } as any);
          });
        } else {
          new Notification(titulo, { body: cuerpo, icon: '/icon-192.png', tag: 'nuevo-pedido' });
        }
      } catch (e) {
        console.error('Error al mostrar notificación local:', e);
      }
    }
  }, [playTripleBeep]); // Changed dependency from playBeep to playTripleBeep

  return { permission, requestPermission, playBeep, playTripleBeep, speakText, speakNewOrder, notifyNewOrder };
}
