import { UtensilsCrossed } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import MenuManager from '../../components/MenuManager';

export default function ManagerMenu() {
  return (
    <DashboardLayout>
      <PageHeader icon={UtensilsCrossed} title="Menu Management" subtitle="Categories and food items for your restaurant." />
      <MenuManager apiPrefix="/manager" />
    </DashboardLayout>
  );
}
