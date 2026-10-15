import CustomerNav from './CustomerNav';

export default function CustomerLayout({ children }) {
  return (
    <div className="consumer-shell">
      <CustomerNav />
      <div className="consumer-body">{children}</div>
    </div>
  );
}
