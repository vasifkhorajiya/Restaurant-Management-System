import { useState } from 'react';
import { COUNTRIES, normalizePhone } from '../utils/contact';

// Country code dropdown + EXACTLY 10 digits. Emits the full number as "+919876543211" via onChange.
export default function PhoneInput({ value = '', onChange, required, disabled, id }) {
  const initial = (() => {
    const m = /^\+(\d{1,3})(\d{10})$/.exec(String(value).replace(/\s/g, ''));
    return m ? { cc: m[1], number: m[2] } : { cc: '91', number: '' };
  })();
  const [cc, setCc] = useState(initial.cc);
  const [number, setNumber] = useState(initial.number);
  const [touched, setTouched] = useState(false);

  const emit = (nextCc, nextNum) => onChange?.(nextNum ? `+${nextCc}${nextNum}` : '');
  const check = number.length === 10 ? normalizePhone(`+${cc}${number}`) : null;
  const error = touched && number.length > 0 && (number.length < 10 ? `${10 - number.length} more digit${10 - number.length === 1 ? '' : 's'} needed` : check && !check.ok ? check.error : '');

  return (
    <div>
      <div className="phone-input">
        <select value={cc} disabled={disabled} onChange={(e) => { setCc(e.target.value); emit(e.target.value, number); }} aria-label="Country code">
          {COUNTRIES.map(([code, name]) => <option key={code} value={code}>+{code} {name}</option>)}
        </select>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={10}
          placeholder="10-digit mobile number"
          value={number}
          required={required}
          disabled={disabled}
          onBlur={() => setTouched(true)}
          onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 10); setNumber(d); emit(cc, d); }}
        />
      </div>
      {error && <div className="field-error">{error}</div>}
      {!error && number.length === 10 && check?.ok && <div className="field-ok">✓ +{cc} {number}</div>}
    </div>
  );
}
