import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { CategoriesPage } from './pages/CategoriesPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ProductTypesPage } from './pages/ProductTypesPage';
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
          <Route
            path={ROUTES.serializedItems}
            element={<ComingSoonPage titleKey="nav.serializedItems" />}
          />
          <Route path={ROUTES.boxes} element={<ComingSoonPage titleKey="nav.boxes" />} />
          <Route
            path={ROUTES.purchaseOrders}
            element={<ComingSoonPage titleKey="nav.purchaseOrders" />}
          />
          <Route path={ROUTES.workOrders} element={<ComingSoonPage titleKey="nav.workOrders" />} />
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
          <Route
            path={ROUTES.transactionLog}
            element={<ComingSoonPage titleKey="nav.transactionLog" />}
          />
          <Route path={ROUTES.settings} element={<ComingSoonPage titleKey="nav.settings" />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
