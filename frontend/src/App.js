import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { Cloud, Zap, Server, Settings } from 'lucide-react';
import InventoryPage from './pages/inventory/InventoryPage';
import ConfigPage from './pages/config/ConfigPage';
import ControlPage from './pages/control/ControlPage';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" theme="dark" richColors duration={2500} />
      <div className="flex h-screen" onClick={() => toast.dismiss()}>
        {/* Sidebar */}
        <aside className="w-56 bg-[#0e1015] border-r border-[#1e232b] flex flex-col p-3">
          <div className="flex items-center gap-2.5 mb-6 px-3 pt-2">
            <Cloud className="h-5 w-5 text-white" />
            <span className="text-white font-semibold text-[14px]">Cloud Pulse Agent</span>
          </div>
          <nav className="space-y-1">
            <NavLink to="/control" className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${isActive ? 'bg-[#1a1d24] text-white' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24]'}`}>
              {({isActive}) => (
                <>
                  <Zap className={`h-4 w-4 ${isActive ? 'text-[#3b82f6]' : 'text-[#8b949e]'}`} /> Control
                </>
              )}
            </NavLink>
            <NavLink to="/inventory" className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${isActive ? 'bg-[#1a1d24] text-white' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24]'}`}>
              {({isActive}) => (
                <>
                  <Server className={`h-4 w-4 ${isActive ? 'text-[#3b82f6]' : 'text-[#8b949e]'}`} /> Inventory
                </>
              )}
            </NavLink>
            <NavLink to="/config" className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${isActive ? 'bg-[#1a1d24] text-white' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24]'}`}>
              {({isActive}) => (
                <>
                  <Settings className={`h-4 w-4 ${isActive ? 'text-[#3b82f6]' : 'text-[#8b949e]'}`} /> Configuration
                </>
              )}
            </NavLink>
          </nav>
        </aside>
        {/* Main content */}
        <main id="main-scroll-container" className="flex-1 overflow-y-auto p-6 bg-[#0a0a0f]">
          <Routes>
            <Route path="/" element={<Navigate to="/control" replace />} />
            <Route path="/control" element={<ControlPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/config" element={<ConfigPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
