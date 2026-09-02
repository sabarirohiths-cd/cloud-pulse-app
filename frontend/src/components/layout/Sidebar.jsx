import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Cloud, Settings, Activity, Boxes, CloudCog, ChevronDown, ChevronRight, PanelLeftClose, PanelLeft } from 'lucide-react';
import { listConfigs } from '../../api/config';

export function Sidebar() {
  const [provider, setProvider] = useState(localStorage.getItem('pulse_control_provider') || 'AWS');
  const [verifiedConfigs, setVerifiedConfigs] = useState([]);
  const [controlExpanded, setControlExpanded] = useState(true);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarMinimized(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    // Trigger window resize event after transition completes to force visualizations to re-center
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 300);
    return () => clearTimeout(timer);
  }, [isSidebarMinimized]);
  
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
    <aside className={`${isSidebarMinimized ? 'w-[72px]' : 'w-64'} transition-all duration-300 ease-in-out bg-[#0e1015] border-r border-[#1e232b] flex flex-col shrink-0 z-20 relative`}>
      <div 
        className={`flex items-center ${isSidebarMinimized ? 'justify-center group cursor-pointer relative' : 'justify-between'} pt-6 pb-4 px-5`}
        onClick={() => { if (isSidebarMinimized) setIsSidebarMinimized(false); }}
      >
        <div className={`flex items-center gap-2.5 ${isSidebarMinimized ? 'px-0 relative' : ''}`}>
          <div className={`relative flex items-center justify-center shrink-0 transition-opacity duration-300 ${isSidebarMinimized ? 'group-hover:opacity-0' : ''}`}>
            <Cloud className="h-6 w-6 text-white" strokeWidth={1.5} />
            <Activity className="h-3 w-3 text-white absolute" strokeWidth={3} />
          </div>
          
          {isSidebarMinimized && (
            <>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-white">
                <PanelLeft size={20} />
              </div>
              <div className="absolute left-[72px] top-1/2 -translate-y-1/2 ml-2 hidden group-hover:block bg-[#15181e] text-white text-xs font-medium py-1.5 px-3 rounded-md shadow-xl border border-zinc-800 whitespace-nowrap z-[110]">
                Expand Sidebar <span className="text-zinc-500 ml-1 font-mono">(⌘B)</span>
              </div>
            </>
          )}

          {!isSidebarMinimized && (
            <span className="text-white font-bold tracking-tight text-[15px] whitespace-nowrap overflow-hidden">
              Cloud Pulse Agent
            </span>
          )}
        </div>
        
        {!isSidebarMinimized && (
          <div className="relative group/collapse">
            <button 
              onClick={(e) => { e.stopPropagation(); setIsSidebarMinimized(true); }}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <PanelLeftClose size={16} />
            </button>
            <div className="absolute right-0 top-full mt-2 hidden group-hover/collapse:block bg-[#15181e] text-white text-xs font-medium py-1.5 px-3 rounded-md shadow-xl border border-zinc-800 whitespace-nowrap z-[110]">
              Collapse <span className="text-zinc-500 ml-1 font-mono">(⌘B)</span>
            </div>
          </div>
        )}
      </div>

      <nav className="space-y-1 px-3">
        <div className="relative group/control">
          <button 
            onClick={() => setControlExpanded(!controlExpanded)}
            className={`w-full flex items-center ${isSidebarMinimized ? 'justify-center' : 'justify-between'} px-3 py-2.5 text-[13px] font-medium transition-colors border-l-2 ${location.pathname === '/control' ? 'text-white border-purple-500' : 'text-[#8b949e] hover:text-white border-transparent'} ${isSidebarMinimized && controlExpanded ? 'bg-[#1a1d24] rounded-t-xl' : location.pathname === '/control' ? 'bg-[#1a1d24] rounded-lg' : 'hover:bg-[#1a1d24] rounded-lg'}`}
          >
            <div className={`flex items-center ${isSidebarMinimized ? 'w-full justify-center gap-1' : 'gap-3'}`}>
              <Activity className={`h-4 w-4 shrink-0 transition-colors ${location.pathname === '/control' ? 'text-purple-400' : 'text-[#8b949e] group-hover/control:text-zinc-300'}`} />
              {!isSidebarMinimized && <span className="whitespace-nowrap overflow-hidden">Control</span>}
            </div>
            {!isSidebarMinimized && (
              <div className="text-[#8b949e] hover:text-white transition-colors">
                {controlExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              </div>
            )}
          </button>
          
          {/* Custom Hover Tooltip */}
          {isSidebarMinimized && (
            <div className="absolute left-[72px] top-1/2 -translate-y-1/2 ml-2 hidden group-hover/control:block bg-[#15181e] text-white text-xs font-medium py-1.5 px-3 rounded-md shadow-xl border border-zinc-800 whitespace-nowrap z-[110]">
              Control
            </div>
          )}
          
          {/* Inline Submenu */}
          {controlExpanded && (
            <div className={isSidebarMinimized ? `flex flex-col items-center gap-1.5 bg-[#1a1d24] rounded-b-xl pb-2.5 pt-1 w-full border-l-2 ${location.pathname === '/control' ? 'border-purple-500' : 'border-transparent'}` : 'mt-1 space-y-1 ml-6 border-l border-zinc-800/60 pl-3'}>
              {availableProviders.map(p => (
                <button
                  key={p}
                  onClick={() => {
                    handleProviderChange(p);
                    if (location.pathname !== '/control') navigate('/control');
                  }}
                  title={isSidebarMinimized ? p : undefined}
                  className={isSidebarMinimized
                    ? `flex items-center justify-center w-7 h-7 rounded-lg transition-all ${provider === p && location.pathname === '/control' ? 'bg-purple-500/20 ring-1 ring-purple-500 shadow-md shadow-purple-500/10' : 'hover:bg-zinc-800/60'}`
                    : `w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors tracking-wide ${provider === p && location.pathname === '/control' ? 'text-white bg-[#1a1d24]' : 'text-[#737d8c] hover:text-zinc-300 hover:bg-[#1a1d24]/50'}`
                  }
                >
                  {isSidebarMinimized ? (
                    <img src={`/${p === 'AWS' ? 'aws' : p === 'GCP' ? 'gcp' : 'azure'}-logo.svg`} alt={p} className="h-4 w-4 object-contain opacity-90 hover:opacity-100 drop-shadow-sm" />
                  ) : (
                    <>
                      <div className={`h-1.5 w-1.5 rounded-full ${provider === p && location.pathname === '/control' ? 'bg-purple-400' : 'bg-transparent'}`} />
                      {p === 'AWS' ? 'Amazon Web Services' : p === 'GCP' ? 'Google Cloud' : 'Microsoft Azure'}
                    </>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative group/inventory">
          <NavLink to="/inventory" className={({isActive}) => `flex items-center gap-3 ${isSidebarMinimized ? 'justify-center' : ''} px-3 py-2.5 text-[13px] font-medium transition-colors border-l-2 ${isActive ? 'bg-[#1a1d24] text-white border-teal-400 rounded-lg' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24] border-transparent rounded-lg'}`}>
            {({isActive}) => (
              <>
                <Boxes className={`h-4 w-4 shrink-0 transition-colors ${isActive ? 'text-teal-400' : 'text-[#8b949e] group-hover/inventory:text-zinc-300'}`} />
                {!isSidebarMinimized && <span className="whitespace-nowrap overflow-hidden">Inventory</span>}
              </>
            )}
          </NavLink>
          {isSidebarMinimized && (
            <div className="absolute left-[72px] top-1/2 -translate-y-1/2 ml-2 hidden group-hover/inventory:block bg-[#15181e] text-white text-xs font-medium py-1.5 px-3 rounded-md shadow-xl border border-zinc-800 whitespace-nowrap z-[110]">
              Inventory
            </div>
          )}
        </div>
        
        <div className="relative group/config">
          <NavLink to="/config" className={({isActive}) => `flex items-center gap-3 ${isSidebarMinimized ? 'justify-center' : ''} px-3 py-2.5 text-[13px] font-medium transition-colors border-l-2 ${isActive ? 'bg-[#1a1d24] text-white border-cyan-400 rounded-lg' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24] border-transparent rounded-lg'}`}>
            {({isActive}) => (
              <>
                <CloudCog className={`h-4 w-4 shrink-0 transition-colors ${isActive ? 'text-cyan-400' : 'text-[#8b949e] group-hover/config:text-zinc-300'}`} />
                {!isSidebarMinimized && <span className="whitespace-nowrap overflow-hidden">Configuration</span>}
              </>
            )}
          </NavLink>
          {isSidebarMinimized && (
            <div className="absolute left-[72px] top-1/2 -translate-y-1/2 ml-2 hidden group-hover/config:block bg-[#15181e] text-white text-xs font-medium py-1.5 px-3 rounded-md shadow-xl border border-zinc-800 whitespace-nowrap z-[110]">
              Configuration
            </div>
          )}
        </div>
        <div className="relative group/discovery mt-auto pb-4">
          <NavLink to="/control-sync-vis" className={({isActive}) => `flex items-center gap-3 ${isSidebarMinimized ? 'justify-center' : ''} px-3 py-2.5 text-[13px] font-medium transition-colors border-l-2 ${isActive ? 'bg-[#1a1d24] text-white border-amber-400 rounded-lg' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24] border-transparent rounded-lg'}`}>
            {({isActive}) => (
              <>
                <Settings className={`h-4 w-4 shrink-0 transition-colors ${isActive ? 'text-amber-400' : 'text-[#8b949e] group-hover/discovery:text-zinc-300'}`} />
                {!isSidebarMinimized && <span className="whitespace-nowrap overflow-hidden">Control - Sync & Vis</span>}
              </>
            )}
          </NavLink>
          {isSidebarMinimized && (
            <div className="absolute left-[72px] top-1/2 -translate-y-1/2 ml-2 hidden group-hover/discovery:block bg-[#15181e] text-white text-xs font-medium py-1.5 px-3 rounded-md shadow-xl border border-zinc-800 whitespace-nowrap z-[110]">
              Control - Sync & Vis
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
