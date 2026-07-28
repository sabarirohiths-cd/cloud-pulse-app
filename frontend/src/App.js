import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { Server, Settings, Power } from 'lucide-react';
import InventoryPage from './pages/inventory/InventoryPage';
import ConfigPage from './pages/config/ConfigPage';
import ControlPage from './pages/control/ControlPage';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" theme="dark" richColors duration={2500} />
      <div className="flex h-screen" onClick={() => toast.dismiss()}>
        {/* Sidebar */}
        <aside className="w-56 bg-[#0f0f1a] border-r border-zinc-800/50 flex flex-col p-4">
          <h1 className="text-lg font-bold text-white mb-6">CloudPulse</h1>
          <nav className="space-y-1">
            <NavLink to="/control" className={({isActive}) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
              <Power className="h-4 w-4" /> Control
            </NavLink>
            <NavLink to="/inventory" className={({isActive}) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
              <Server className="h-4 w-4" /> Inventory
            </NavLink>
            <NavLink to="/config" className={({isActive}) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
              <Settings className="h-4 w-4" /> Cloud Config
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
