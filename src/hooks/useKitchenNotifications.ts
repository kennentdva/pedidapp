import { useCallback, useRef, useState } from 'react';

type PermissionStatus = 'idle' | 'granted' | 'denied' | 'unsupported';

/**
 * Hook que gestiona:
 * 1. Notificaciones nativas del navegador (Web Notifications API)
 * 2. Sonido beep mediante Web Audio API
 *
 * Ambas se activan con un solo botón. El estado se sincroniza
 * usando refs para evitar el problema de stale closure en callbacks async
 * (ej: subscripciones de Supabase Realtime).
 */
export function useKitchenNotifications() {
  const [permission, setPermission] = useState<PermissionStatus>(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return 'idle';
  });

  // Ref espejo para evitar stale closure en callbacks async
  const permissionRef = useRef<PermissionStatus>(permission);

  const audioCtxRef = useRef<AudioContext | null>(null);

  /** Solicita permiso de notificaciones + activa el AudioContext (requiere gesto del usuario) */
  const requestPermission = useCallback(async () => {
    // Activar AudioContext (requiere interacción del usuario)
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }
    } catch (_) {}

    // Solicitar permiso de notificaciones del SO
    if (typeof Notification === 'undefined') {
      setPermission('unsupported');
      permissionRef.current = 'unsupported';
      return;
    }

    if (Notification.permission === 'granted') {
      setPermission('granted');
      permissionRef.current = 'granted';
      return;
    }

    if (Notification.permission === 'denied') {
      setPermission('denied');
      permissionRef.current = 'denied';
      alert('Las notificaciones están bloqueadas en este navegador. Por favor, habilítalas en la configuración del sitio (candado 🔒 en la barra de direcciones).');
      return;
    }

    const result = await Notification.requestPermission();
    const status: PermissionStatus = result === 'granted' ? 'granted' : 'denied';
    setPermission(status);
    permissionRef.current = status;
  }, []);

  /** Reproduce un beep de dos notas (A5 + C#6) */
  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const play = (freq: number, start: number, duration: number, type: OscillatorType, vol: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(vol, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };

      play(880, 0, 0.5, 'sine', 0.5);       // A5
      play(1108.73, 0.1, 0.5, 'triangle', 0.4); // C#6
    } catch (_) {}
  }, []);

  /**
   * Envía una notificación nativa del SO + beep.
   * Debe llamarse desde callbacks async como los de Supabase Realtime.
   */
  const notifyNewOrder = useCallback((titulo: string, cuerpo: string, iconUrl?: string) => {
    // Siempre intentar beep si hay AudioContext
    playBeep();

    // Notificación nativa
    if (permissionRef.current !== 'granted') return;
    try {
      const n = new Notification(titulo, {
        body: cuerpo,
        icon: iconUrl ?? '/favicon.ico',
        tag: 'nuevo-pedido', // Agrupa notificaciones del mismo tipo
      });
      // Auto-cerrar después de 6 segundos
      setTimeout(() => n.close(), 6000);
    } catch (_) {}
  }, [playBeep]);

  const soundEnabled = permission === 'granted';

  return { soundEnabled, permission, requestPermission, playBeep, notifyNewOrder };
}
