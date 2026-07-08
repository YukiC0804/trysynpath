import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MarketingHomePage } from './pages/MarketingHomePage';
import { OperationsDemoPage } from './pages/OperationsDemoPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MarketingHomePage />} />
        <Route path="/demo" element={<OperationsDemoPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
