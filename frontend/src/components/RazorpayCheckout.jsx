import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { CreditCard, Landmark, Smartphone, Wallet, ShieldCheck, CheckCircle2, X } from 'lucide-react';
import api from '../services/api';
import { inr } from '../utils/format';

// A stand-in for Razorpay's hosted checkout (checkout.js). Same steps the real one has:
// pick method -> pay -> (card: bank OTP) -> returns { razorpay_order_id, razorpay_payment_id, razorpay_signature }.
// Only the TEST cards/UPI IDs shown below work. Nothing here ever charges real money.
const METHODS = [
  { key: 'card', label: 'Card', icon: CreditCard },
  { key: 'upi', label: 'UPI', icon: Smartphone },
  { key: 'netbanking', label: 'Netbanking', icon: Landmark },
  { key: 'wallet', label: 'Wallet', icon: Wallet },
];
const BANKS = ['HDFC', 'ICICI', 'SBI', 'AXIS', 'KOTAK', 'YES'];
const WALLETS = ['Paytm', 'PhonePe', 'Amazon Pay', 'Mobikwik'];

const fmtCard = (v) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
const fmtExpiry = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

export default function RazorpayCheckout({ order, onCaptured, onDismiss }) {
  const [method, setMethod] = useState('card');
  const [step, setStep] = useState('form'); // form | otp | processing | success
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '', name: '' });
  const [vpa, setVpa] = useState('');
  const [bank, setBank] = useState('HDFC');
  const [wallet, setWallet] = useState('Paytm');
  const [txn, setTxn] = useState(null);
  const [bankOtp, setBankOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const done = async (captured) => {
    setStep('processing');
    try {
      await onCaptured(captured);
      setStep('success');
    } catch (err) {
      setStep('form');
      setError(err.message || 'Payment could not be completed');
    }
  };

  const call = async (url, payload) => {
    setError('');
    setBusy(true);
    try {
      const res = await api.post(url, { gateway_order_id: order.gateway_order_id, ...payload });
      if (res.data.status === 'otp_required') { setTxn(res.data); setStep('otp'); return; }
      await done(res.data);
    } catch (err) {
      const d = err.response?.data;
      setError(d ? `${d.message}${d.attempts_left !== undefined ? ` (${d.attempts_left} attempt${d.attempts_left === 1 ? '' : 's'} left)` : ''}` : 'Network error');
      if (d?.attempts_left === 0 || err.response?.status === 410) setTimeout(onDismiss, 1800);
    } finally {
      setBusy(false);
    }
  };

  const pay = (simulate) => call('/payments/fake-gateway/pay', { method, card, upi: { vpa }, bank, wallet, simulate });
  const submitOtp = () => call('/payments/fake-gateway/otp', { txn: txn.txn, otp: bankOtp });

  const close = () => {
    if (step === 'processing' || step === 'success') return;
    api.post('/payments/cancel', { gateway_order_id: order.gateway_order_id }).catch(() => {});
    onDismiss();
  };

  return (
    <Modal show onHide={close} centered backdrop="static" dialogClassName="rzp-dialog">
      <div className="rzp">
        <div className="rzp-head">
          <div>
            <div className="rzp-merchant">{order.name}</div>
            <div className="rzp-desc">{order.description}</div>
          </div>
          <div className="text-end">
            <div className="rzp-amount">{inr(order.amount / 100)}</div>
            <button className="rzp-x" onClick={close} aria-label="Close"><X size={16} /></button>
          </div>
        </div>
        <div className="rzp-test">TEST MODE · demo gateway · no real money moves</div>

        {step === 'success' && (
          <div className="rzp-center">
            <CheckCircle2 size={56} color="#1ba672" />
            <h5 className="mt-3">Payment successful</h5>
            <p className="text-muted mb-3">Placing your order…</p>
            <button className="btn btn-dark" onClick={onDismiss}>Done</button>
          </div>
        )}
        {step === 'processing' && (
          <div className="rzp-center"><div className="spinner-border text-primary" /><p className="mt-3 mb-0">Verifying payment…</p></div>
        )}

        {step === 'otp' && (
          <div className="rzp-body" style={{ display: 'block' }}>
            <h6 className="d-flex align-items-center gap-2"><ShieldCheck size={18} color="#1ba672" /> Bank verification (3-D Secure)</h6>
            <p className="small text-muted">Enter the OTP sent to your mobile by the bank for the {txn.network} card ending <strong>{txn.card_last4}</strong>.</p>
            {order.test_bank_otp && <div className="rzp-hint">Test OTP: <strong>{order.test_bank_otp}</strong></div>}
            {error && <div className="alert alert-danger py-2 small">{error}</div>}
            <input className="form-control mb-3" inputMode="numeric" maxLength={6} placeholder="6-digit OTP" value={bankOtp} onChange={(e) => setBankOtp(e.target.value.replace(/\D/g, ''))} autoFocus />
            <button className="btn rzp-pay w-100" disabled={busy || bankOtp.length < 6} onClick={submitOtp}>{busy ? 'Verifying…' : `Verify & pay ${inr(order.amount / 100)}`}</button>
          </div>
        )}

        {step === 'form' && (
          <div className="rzp-body">
            <div className="rzp-tabs">
              {METHODS.map(({ key, label, icon: Icon }) => (
                <button key={key} className={method === key ? 'active' : ''} onClick={() => { setMethod(key); setError(''); }}><Icon size={16} /> {label}</button>
              ))}
            </div>
            <div className="rzp-pane">
              {error && <div className="alert alert-danger py-2 small">{error}</div>}

              {method === 'card' && (
                <>
                  <label className="form-label small">Card number</label>
                  <input className="form-control mb-2" inputMode="numeric" placeholder="4111 1111 1111 1111" value={card.number} onChange={(e) => setCard({ ...card, number: fmtCard(e.target.value) })} autoComplete="off" />
                  <div className="row g-2 mb-2">
                    <div className="col-6"><input className="form-control" placeholder="MM/YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: fmtExpiry(e.target.value) })} autoComplete="off" /></div>
                    <div className="col-6"><input className="form-control" type="password" inputMode="numeric" maxLength={4} placeholder="CVV" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '') })} autoComplete="off" /></div>
                  </div>
                  <input className="form-control mb-2" placeholder="Name on card" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} autoComplete="off" />
                  <div className="rzp-hint">
                    Test cards: <code>4111 1111 1111 1111</code> succeeds · <code>4000 0000 0000 0002</code> declined · <code>4000 0000 0000 9995</code> no funds. Any future expiry, any CVV.
                  </div>
                </>
              )}

              {method === 'upi' && (
                <>
                  <label className="form-label small">UPI ID</label>
                  <input className="form-control mb-2" placeholder="name@okhdfcbank" value={vpa} onChange={(e) => setVpa(e.target.value)} autoComplete="off" />
                  <div className="rzp-hint">Test UPI: <code>success@razorpay</code> succeeds · <code>failure@razorpay</code> fails.</div>
                </>
              )}

              {method === 'netbanking' && (
                <>
                  <label className="form-label small">Choose your bank</label>
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    {BANKS.map((b) => <button key={b} type="button" className={`slot-btn${bank === b ? ' selected' : ''}`} onClick={() => setBank(b)}>{b}</button>)}
                  </div>
                  <div className="rzp-hint">The real flow redirects to your bank. Here you can pick the outcome below.</div>
                </>
              )}

              {method === 'wallet' && (
                <>
                  <label className="form-label small">Choose a wallet</label>
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    {WALLETS.map((w) => <button key={w} type="button" className={`slot-btn${wallet === w ? ' selected' : ''}`} onClick={() => setWallet(w)}>{w}</button>)}
                  </div>
                </>
              )}

              <button className="btn rzp-pay w-100 mt-3" disabled={busy} onClick={() => pay('success')}>{busy ? 'Processing…' : `Pay ${inr(order.amount / 100)}`}</button>
              {method === 'netbanking' && <button className="btn btn-outline-danger w-100 mt-2" disabled={busy} onClick={() => pay('failure')}>Simulate bank failure</button>}
              <div className="rzp-secure"><ShieldCheck size={13} /> Card details are never stored — only the last 4 digits.</div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
