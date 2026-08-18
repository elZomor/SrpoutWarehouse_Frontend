import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { BoxesPage } from './pages/BoxesPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { DamageReportsPage } from './pages/DamageReportsPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { MaintenanceOrdersPage } from './pages/MaintenanceOrdersPage';
import { MissingItemsPage } from './pages/MissingItemsPage';
import { ProductTypesPage } from './pages/ProductTypesPage';
import { PurchaseOrdersPage } from './pages/PurchaseOrdersPage';
import { SerializedItemsPage } from './pages/SerializedItemsPage';
import { TransactionLogPage } from './pages/TransactionLogPage';
import { WorkOrdersPage } from './pages/WorkOrdersPage';
import { ROUTES } from './routes';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path={ROUTES.dashboard} element={<DashboardPage />} />
          <Route path={ROUTES.productTypes} element={<ProductTypesPage />} />
          <Route path={ROUTES.categories} element={<CategoriesPage />} />
          <Route path={ROUTES.serializedItems} element={<SerializedItemsPage />} />
          <Route path={ROUTES.boxes} element={<BoxesPage />} />
          <Route path={ROUTES.purchaseOrders} element={<PurchaseOrdersPage />} />
          <Route path={ROUTES.workOrders} element={<WorkOrdersPage />} />
          <Route path={ROUTES.workOrderDetailPattern} element={<WorkOrdersPage />} />
          <Route path={ROUTES.missingItems} element={<MissingItemsPage />} />
          <Route path={ROUTES.damageReports} element={<DamageReportsPage />} />
          <Route path={ROUTES.maintenanceOrders} element={<MaintenanceOrdersPage />} />
          <Route path={ROUTES.transactionLog} element={<TransactionLogPage />} />
          <Route path={ROUTES.settings} element={<ComingSoonPage titleKey="nav.settings" />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
