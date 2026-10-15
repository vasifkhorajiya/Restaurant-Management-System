import { ClipboardList } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import OrdersManager from '../../components/OrdersManager';

export default function AdminOrders() {
  return (
    <DashboardLayout>
      <PageHeader icon={ClipboardList} title="Order Management" subtitle="Every order, every restaurant, live." />
      <OrdersManager apiPrefix="/admin" />
    </DashboardLayout>
  );
}
