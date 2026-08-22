import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Cloud, Settings, Activity, Boxes, CloudCog, ChevronDown, ChevronRight } from 'lucide-react';
import { listConfigs } from '../../api/config';

export function Sidebar() {
  const [provider, setProvider] = useState(localStorage.getItem('pulse_control_provider') || 'AWS');
  const [verifiedConfigs, setVerifiedConfigs] = useState([]);
  const [controlExpanded, setControlExpanded] = useState(true);
  const [adminExpanded, setAdminExpanded] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const res = await listConfigs();
        const configs = res.data.configs || [];
        setVerifiedConfigs(configs.filter(c => c.verified && (c.active_modules ?? 'inventory,control').includes('control')));
      } catch (err) {
        console.error("Failed to fetch configs in Sidebar", err);
      }
    };
    fetchConfigs();

    window.addEventListener('app:config-changed', fetchConfigs);
    return () => window.removeEventListener('app:config-changed', fetchConfigs);
  }, []);

  const availableProviders = ['AWS', 'AZURE', 'GCP'];

  const handleProviderChange = (p) => {
    setProvider(p);
    localStorage.setItem('pulse_control_provider', p);
    localStorage.setItem('pulse_admin_provider', p); // sync admin provider too
    window.dispatchEvent(new Event('app:provider-change'));
  };

  return (
    <aside className="w-64 bg-[#0e1015] border-r border-[#1e232b] flex flex-col">
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-4">
        <div className="relative flex items-center justify-center">
          <Cloud className="h-6 w-6 text-white" strokeWidth={1.5} />
          <Activity className="h-3 w-3 text-white absolute" strokeWidth={3} />
        </div>
        <span className="text-white font-bold tracking-tight text-[15px]">Cloud Pulse Agent</span>
      </div>

      <nav className="space-y-1 px-3">
        <div>
          <button 
            onClick={() => setControlExpanded(!controlExpanded)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${location.pathname === '/control' ? 'bg-[#1a1d24] text-white' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24]'}`}
          >
            <div className="flex items-center gap-3">
              <Activity className="h-4 w-4 text-purple-400" /> Control
            </div>
            <div className="text-[#8b949e] hover:text-white transition-colors">
              {controlExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </button>
          
          {controlExpanded && (
            <div className="mt-1 ml-6 space-y-0.5 border-l border-zinc-800/60 pl-3">
              {availableProviders.map(p => (
                <button
                  key={p}
                  onClick={() => {
                    handleProviderChange(p);
                    if (location.pathname !== '/control') {
                      navigate('/control');
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors tracking-wide ${provider === p && location.pathname === '/control' ? 'text-white bg-[#1a1d24]' : 'text-[#737d8c] hover:text-zinc-300 hover:bg-[#1a1d24]/50'}`}
                >
                  <div className={`h-1.5 w-1.5 rounded-full ${provider === p && location.pathname === '/control' ? 'bg-purple-400' : 'bg-transparent'}`} />
                  {p === 'AWS' ? 'Amazon Web Services' : p === 'GCP' ? 'Google Cloud' : 'Microsoft Azure'}
                </button>
              ))}
            </div>
          )}
        </div>
        <NavLink to="/inventory" className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${isActive ? 'bg-[#1a1d24] text-white' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24]'}`}>
          {({isActive}) => (
            <>
              <Boxes className="h-4 w-4 text-teal-400" /> Inventory
            </>
          )}
        </NavLink>
        <NavLink to="/config" className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${isActive ? 'bg-[#1a1d24] text-white' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24]'}`}>
          {({isActive}) => (
            <>
              <CloudCog className="h-4 w-4 text-cyan-400" /> Configuration
            </>
          )}
        </NavLink>
        <div>
          <button 
            onClick={() => setAdminExpanded(!adminExpanded)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${location.pathname.startsWith('/admin') ? 'bg-[#1a1d24] text-white' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24]'}`}
          >
            <div className="flex items-center gap-3">
              <Settings className="h-4 w-4 text-amber-400" /> Admin
            </div>
            <div className="text-[#8b949e] hover:text-white transition-colors">
              {adminExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </button>
          
          {adminExpanded && (
            <div className="mt-1 ml-6 space-y-0.5 border-l border-zinc-800/60 pl-3">
              <NavLink
                to="/admin"
                className={({isActive}) => `w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors tracking-wide ${isActive ? 'text-white bg-[#1a1d24]' : 'text-[#737d8c] hover:text-zinc-300 hover:bg-[#1a1d24]/50'}`}
              >
                {({isActive}) => (
                  <>
                    <div className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-amber-400' : 'bg-transparent'}`} />
                    Control Admin
                  </>
                )}
              </NavLink>
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
