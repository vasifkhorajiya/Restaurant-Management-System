import { useState } from 'react';
import { normalizeGmail } from '../utils/contact';

// Email input that only accepts Gmail addresses, with instant feedback.
export default function GmailField({ value, onChange, required, disabled, name = 'email', id, placeholder = 'yourname@gmail.com' }) {
  const [touched, setTouched] = useState(false);
  const res = value ? normalizeGmail(value) : null;
  return (
    <div>
      <input
        id={id} name={name} type="email" className="form-control" inputMode="email" autoComplete="email"
        placeholder={placeholder} value={value} required={required} disabled={disabled}
        onBlur={() => setTouched(true)} onChange={(e) => onChange(e.target.value)}
      />
      {touched && res && !res.ok && <div className="field-error">{res.error}</div>}
      {res?.ok && <div className="field-ok">✓ Gmail address looks good</div>}
    </div>
  );
}
