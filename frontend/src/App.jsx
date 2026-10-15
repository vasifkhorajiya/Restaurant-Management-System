import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ForgotPassword from './pages/Auth/ForgotPassword';
import ProtectedRoute from './components/ProtectedRoute';

import AdminDashboard from './pages/Admin/AdminDashboard';
import AdminUsers from './pages/Admin/Users';
import AdminManagers from './pages/Admin/Managers';
import AdminRestaurants from './pages/Admin/Restaurants';
import AdminMenu from './pages/Admin/Menu';
import AdminOrders from './pages/Admin/Orders';
import AdminReports from './pages/Admin/Reports';
import AdminReservations from './pages/Admin/Reservations';

import ManagerDashboard from './pages/Manager/ManagerDashboard';
import ManagerOrders from './pages/Manager/Orders';
import ManagerMenu from './pages/Manager/Menu';
import ManagerStaff from './pages/Manager/Staff';
import ManagerCustomers from './pages/Manager/Customers';
import ManagerReports from './pages/Manager/Reports';
import ManagerReservations from './pages/Manager/Reservations';

import Favorites from './pages/User/Favorites';
import Notifications from './pages/User/Notifications';
import CouponsPage from './pages/Shared/Coupons';
import ReviewsPage from './pages/Shared/Reviews';
import InventoryPage from './pages/Shared/Inventory';
import PaymentsPage from './pages/Shared/Payments';
import ExpensesPage from './pages/Shared/Expenses';
import POS from './pages/Manager/POS';
import Attendance from './pages/Manager/Attendance';
import Integrations from './pages/Admin/Integrations';
import ResetPassword from './pages/Auth/ResetPassword';
import AuditLog from './pages/Admin/AuditLog';
import KitchenDisplay from './pages/Manager/KitchenDisplay';
import Tables from './pages/Manager/Tables';
import UserDashboard from './pages/User/UserDashboard';
import UserMenu from './pages/User/Menu';
import Cart from './pages/User/Cart';
import UserOrders from './pages/User/Orders';
import Profile from './pages/User/Profile';
import Reservations from './pages/User/Reservations';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/managers" element={<ProtectedRoute allowedRoles={['admin']}><AdminManagers /></ProtectedRoute>} />
      <Route path="/admin/restaurants" element={<ProtectedRoute allowedRoles={['admin']}><AdminRestaurants /></ProtectedRoute>} />
      <Route path="/admin/menu" element={<ProtectedRoute allowedRoles={['admin']}><AdminMenu /></ProtectedRoute>} />
      <Route path="/admin/orders" element={<ProtectedRoute allowedRoles={['admin']}><AdminOrders /></ProtectedRoute>} />
      <Route path="/admin/reservations" element={<ProtectedRoute allowedRoles={['admin']}><AdminReservations /></ProtectedRoute>} />
      <Route path="/admin/reports" element={<ProtectedRoute allowedRoles={['admin']}><AdminReports /></ProtectedRoute>} />

      <Route path="/admin/coupons" element={<ProtectedRoute allowedRoles={['admin']}><CouponsPage apiPrefix="/admin" /></ProtectedRoute>} />
      <Route path="/admin/reviews" element={<ProtectedRoute allowedRoles={['admin']}><ReviewsPage apiPrefix="/admin" /></ProtectedRoute>} />
      <Route path="/admin/inventory" element={<ProtectedRoute allowedRoles={['admin']}><InventoryPage apiPrefix="/admin" /></ProtectedRoute>} />
      <Route path="/admin/audit" element={<ProtectedRoute allowedRoles={['admin']}><AuditLog /></ProtectedRoute>} />

      <Route path="/admin/payments" element={<ProtectedRoute allowedRoles={['admin']}><PaymentsPage apiPrefix="/admin" /></ProtectedRoute>} />
      <Route path="/admin/expenses" element={<ProtectedRoute allowedRoles={['admin']}><ExpensesPage apiPrefix="/admin" /></ProtectedRoute>} />
      <Route path="/admin/integrations" element={<ProtectedRoute allowedRoles={['admin']}><Integrations /></ProtectedRoute>} />

      {/* Manager routes */}
      <Route path="/manager" element={<ProtectedRoute allowedRoles={['manager']}><ManagerDashboard /></ProtectedRoute>} />
      <Route path="/manager/orders" element={<ProtectedRoute allowedRoles={['manager']}><ManagerOrders /></ProtectedRoute>} />
      <Route path="/manager/reservations" element={<ProtectedRoute allowedRoles={['manager']}><ManagerReservations /></ProtectedRoute>} />
      <Route path="/manager/menu" element={<ProtectedRoute allowedRoles={['manager']}><ManagerMenu /></ProtectedRoute>} />
      <Route path="/manager/staff" element={<ProtectedRoute allowedRoles={['manager']}><ManagerStaff /></ProtectedRoute>} />
      <Route path="/manager/customers" element={<ProtectedRoute allowedRoles={['manager']}><ManagerCustomers /></ProtectedRoute>} />
      <Route path="/manager/reports" element={<ProtectedRoute allowedRoles={['manager']}><ManagerReports /></ProtectedRoute>} />

      <Route path="/manager/kitchen" element={<ProtectedRoute allowedRoles={['manager']}><KitchenDisplay /></ProtectedRoute>} />
      <Route path="/manager/tables" element={<ProtectedRoute allowedRoles={['manager']}><Tables /></ProtectedRoute>} />
      <Route path="/manager/inventory" element={<ProtectedRoute allowedRoles={['manager']}><InventoryPage apiPrefix="/manager" /></ProtectedRoute>} />
      <Route path="/manager/coupons" element={<ProtectedRoute allowedRoles={['manager']}><CouponsPage apiPrefix="/manager" /></ProtectedRoute>} />
      <Route path="/manager/reviews" element={<ProtectedRoute allowedRoles={['manager']}><ReviewsPage apiPrefix="/manager" /></ProtectedRoute>} />

      <Route path="/manager/pos" element={<ProtectedRoute allowedRoles={['manager']}><POS /></ProtectedRoute>} />
      <Route path="/manager/payments" element={<ProtectedRoute allowedRoles={['manager']}><PaymentsPage apiPrefix="/manager" /></ProtectedRoute>} />
      <Route path="/manager/expenses" element={<ProtectedRoute allowedRoles={['manager']}><ExpensesPage apiPrefix="/manager" /></ProtectedRoute>} />
      <Route path="/manager/attendance" element={<ProtectedRoute allowedRoles={['manager']}><Attendance /></ProtectedRoute>} />

      {/* User / Customer routes */}
      <Route path="/user" element={<ProtectedRoute allowedRoles={['user']}><UserDashboard /></ProtectedRoute>} />
      <Route path="/user/menu" element={<ProtectedRoute allowedRoles={['user']}><UserMenu /></ProtectedRoute>} />
      <Route path="/user/cart" element={<ProtectedRoute allowedRoles={['user']}><Cart /></ProtectedRoute>} />
      <Route path="/user/orders" element={<ProtectedRoute allowedRoles={['user']}><UserOrders /></ProtectedRoute>} />
      <Route path="/user/profile" element={<ProtectedRoute allowedRoles={['user']}><Profile /></ProtectedRoute>} />
      <Route path="/user/reservations" element={<ProtectedRoute allowedRoles={['user']}><Reservations /></ProtectedRoute>} />

      <Route path="/user/favorites" element={<ProtectedRoute allowedRoles={['user']}><Favorites /></ProtectedRoute>} />
      <Route path="/user/notifications" element={<ProtectedRoute allowedRoles={['user']}><Notifications /></ProtectedRoute>} />

      <Route
        path="/unauthorized"
        element={
          <div className="d-flex flex-column align-items-center justify-content-center vh-100" style={{ background: 'var(--paper)' }}>
            <h3 className="mb-2">🚫 Not authorized</h3>
            <p className="text-muted">This part of the kitchen isn't on your badge.</p>
          </div>
        }
      />
      <Route
        path="*"
        element={
          <div className="d-flex flex-column align-items-center justify-content-center vh-100" style={{ background: 'var(--paper)' }}>
            <h3 className="mb-2">404 — off the menu</h3>
            <p className="text-muted">That page doesn't exist.</p>
          </div>
        }
      />
    </Routes>
  );
}
