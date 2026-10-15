import { BarChart3 } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import ReportsView from '../../components/ReportsView';

export default function ManagerReports() {
  return (
    <DashboardLayout>
      <PageHeader icon={BarChart3} title="Reports" subtitle="Your restaurant's sales performance." />
      <ReportsView apiPrefix="/manager" />
    </DashboardLayout>
  );
}
