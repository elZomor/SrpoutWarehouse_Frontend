import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { CategoriesPage } from './pages/CategoriesPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
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
          <Route path={ROUTES.boxes} element={<ComingSoonPage titleKey="nav.boxes" />} />
          <Route path={ROUTES.purchaseOrders} element={<PurchaseOrdersPage />} />
          <Route path={ROUTES.workOrders} element={<WorkOrdersPage />} />
          <Route
            path={ROUTES.missingItems}
            element={<ComingSoonPage titleKey="nav.missingItems" />}
          />
          <Route
            path={ROUTES.damageReports}
            element={<ComingSoonPage titleKey="nav.damageReports" />}
          />
          <Route
            path={ROUTES.maintenanceOrders}
            element={<ComingSoonPage titleKey="nav.maintenanceOrders" />}
          />
          <Route path={ROUTES.transactionLog} element={<TransactionLogPage />} />
          <Route path={ROUTES.settings} element={<ComingSoonPage titleKey="nav.settings" />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
