import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function DashboardLayout({ children }) {
  return (
    <div className="row g-0 app-shell">
      <Sidebar />
      <div className="col-12 col-md-10">
        <Topbar />
        <div className="page-body">{children}</div>
      </div>
    </div>
  );
}
