import { CalendarCheck } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import ReservationsManager from '../../components/ReservationsManager';

export default function AdminReservations() {
  return (
    <DashboardLayout>
      <PageHeader icon={CalendarCheck} title="Table Reservations" subtitle="Confirm, decline, or check in dine-in bookings." />
      <ReservationsManager apiPrefix="/admin" />
    </DashboardLayout>
  );
}
