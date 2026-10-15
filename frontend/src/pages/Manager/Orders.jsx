import { ClipboardList } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import OrdersManager from '../../components/OrdersManager';

export default function ManagerOrders() {
  return (
    <DashboardLayout>
      <PageHeader icon={ClipboardList} title="Orders" subtitle="Your kitchen's live order board." />
      <OrdersManager apiPrefix="/manager" />
    </DashboardLayout>
  );
}
