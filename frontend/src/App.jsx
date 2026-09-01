import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import InventoryPage from './pages/inventory/InventoryPage';
import ConfigPage from './pages/config/ConfigPage';
import ControlPage from './pages/control/ControlPage';
import AdminPage from './pages/admin/AdminPage';
import { Sidebar } from './components/layout/Sidebar';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" theme="dark" richColors duration={2500} />
      <div className="flex h-screen" onClick={() => toast.dismiss()}>
        <Sidebar />

        {/* Main content */}
        <main id="main-scroll-container" className="flex-1 overflow-y-auto p-6 bg-[#0a0a0f]">
          <Routes>
            <Route path="/" element={<Navigate to="/control" replace />} />
            <Route path="/control" element={<ControlPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
