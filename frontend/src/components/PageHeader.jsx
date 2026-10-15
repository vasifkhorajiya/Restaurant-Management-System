export default function PageHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
      <div className="d-flex align-items-center gap-3">
        {Icon && (
          <div
            className="d-flex align-items-center justify-content-center flex-shrink-0"
            style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--brand-soft)', color: 'var(--brand-dark)' }}
          >
            <Icon size={20} />
          </div>
        )}
        <div>
          <h4 className="mb-0">{title}</h4>
          {subtitle && <p className="text-muted mb-0" style={{ fontSize: 13.5 }}>{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
