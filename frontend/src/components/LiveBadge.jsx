import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useLiveStatus } from '../context/LiveContext';
import { soundEnabled, setSoundEnabled, ding } from '../utils/sound';

// Small "Live" pill: green = real-time connection is up. Staff also get a sound on/off switch.
export default function LiveBadge({ withSound = false }) {
  const status = useLiveStatus();
  const [sound, setSound] = useState(soundEnabled());
  const label = status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Offline';

  return (
    <div className="d-flex align-items-center gap-2">
      <span className={`live-pill ${status}`} title={status === 'live' ? 'Real-time updates are on' : 'Reconnecting — the page still refreshes every 30 seconds'}>
        <i /> {label}
      </span>
      {withSound && (
        <button className="notif-btn" style={{ width: 30, height: 30 }} title={sound ? 'Mute new-order sound' : 'Turn on new-order sound'}
          onClick={() => { const next = !sound; setSound(next); setSoundEnabled(next); if (next) ding(); }}>
          {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
      )}
    </div>
  );
}
