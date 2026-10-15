import { fmtDateTime } from '../utils/format';

const STEPS = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Completed'];
const LABELS = {
  Pending: 'Order placed',
  Accepted: 'Accepted by restaurant',
  Preparing: 'Being prepared',
  Ready: 'Ready',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
};

// Real timestamps from order_status_history — not a fake progress bar.
export default function OrderTimeline({ history = [], status }) {
  const at = {};
  history.forEach((h) => { at[h.status] = h.at; });
  const steps = status === 'Cancelled' ? [...STEPS.filter((s) => at[s]), 'Cancelled'] : STEPS;
  const currentIdx = steps.indexOf(status);

  return (
    <div className="order-timeline">
      {steps.map((s, i) => {
        const done = !!at[s] || i < currentIdx;
        return (
          <div key={s} className={`step${done ? ' done' : ''}${i === currentIdx ? ' current' : ''}`}>
            <span className="dot" />
            <div>
              <div className="label">{LABELS[s]}</div>
              <div className="when">{at[s] ? fmtDateTime(at[s]) : 'Waiting…'}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
