import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

// One live connection (Server-Sent Events) per browser tab.
// Components subscribe with useLive([...eventNames], callback).
const LiveContext = createContext({ status: 'offline', subscribe: () => () => {} });

const EVENTS = ['notification', 'order:new', 'order:update', 'reservation:update', 'service:new', 'service:done'];

export function LiveProvider({ children }) {
  const { user } = useAuth();
  const [status, setStatus] = useState('offline'); // live | connecting | offline
  const listeners = useRef(new Map());              // event -> Set<fn>

  const subscribe = useCallback((event, fn) => {
    if (!listeners.current.has(event)) listeners.current.set(event, new Set());
    listeners.current.get(event).add(fn);
    return () => listeners.current.get(event)?.delete(fn);
  }, []);

  useEffect(() => {
    if (!user) { setStatus('offline'); return undefined; }

    let source;
    let retry = 0;
    let timer;
    let stopped = false;

    const connect = async () => {
      setStatus('connecting');
      try {
        const { data } = await api.post('/events/ticket');
        if (stopped) return;
        source = new EventSource(`/api/events/stream?ticket=${data.ticket}`);
        source.addEventListener('hello', () => { retry = 0; setStatus('live'); });
        EVENTS.forEach((name) => {
          source.addEventListener(name, (e) => {
            let payload = {};
            try { payload = JSON.parse(e.data); } catch { /* ignore */ }
            listeners.current.get(name)?.forEach((fn) => fn(payload, name));
          });
        });
        source.onerror = () => {
          // the ticket is single-use, so a dropped stream always reconnects with a fresh one
          source.close();
          setStatus('offline');
          if (!stopped) { retry = Math.min(retry + 1, 6); timer = setTimeout(connect, 1500 * 2 ** (retry - 1)); }
        };
      } catch {
        setStatus('offline');
        if (!stopped) { retry = Math.min(retry + 1, 6); timer = setTimeout(connect, 1500 * 2 ** (retry - 1)); }
      }
    };
    connect();

    // when a laptop wakes up / the tab comes back, make sure we are connected again
    const onVisible = () => { if (document.visibilityState === 'visible' && (!source || source.readyState === 2)) { clearTimeout(timer); connect(); } };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      source?.close();
    };
  }, [user]);

  return <LiveContext.Provider value={{ status, subscribe }}>{children}</LiveContext.Provider>;
}

export const useLiveStatus = () => useContext(LiveContext).status;

// useLive(['order:update', 'notification'], (payload, eventName) => reload())
export function useLive(events, handler) {
  const { subscribe } = useContext(LiveContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const offs = (Array.isArray(events) ? events : [events]).map((e) => subscribe(e, (p, n) => ref.current(p, n)));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, Array.isArray(events) ? events.join('|') : events]);
}
