export default function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="text-center py-5">
      {Icon && <Icon size={44} color="var(--border)" className="mb-3" />}
      <h6 className="mb-1">{title}</h6>
      {text && <p className="text-muted mb-3" style={{ fontSize: 13.5 }}>{text}</p>}
      {action}
    </div>
  );
}
