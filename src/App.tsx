import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AgentWorkforcePage } from './pages/AgentWorkforcePage';
import { DemoPrepPage } from './pages/DemoPrepPage';
import { OperationsDemoPage } from './pages/OperationsDemoPage';
import { SageAdminPage } from './pages/SageAdminPage';
import { SageIntegrationPage } from './pages/SageIntegrationPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<OperationsDemoPage />} />
        <Route path="/demo" element={<OperationsDemoPage />} />
        <Route path="/agents" element={<AgentWorkforcePage />} />
        <Route path="/sage-integration" element={<SageIntegrationPage />} />
        <Route path="/sage-integration/admin" element={<SageAdminPage />} />
        <Route path="/sage-integration/prepare" element={<DemoPrepPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
