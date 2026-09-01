import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Cloud, Settings, Activity, Boxes, CloudCog, ChevronDown, ChevronRight, PanelLeftClose, PanelLeft } from 'lucide-react';
import { listConfigs } from '../../api/config';

export function Sidebar() {
  const [provider, setProvider] = useState(localStorage.getItem('pulse_control_provider') || 'AWS');
  const [verifiedConfigs, setVerifiedConfigs] = useState([]);
  const [controlExpanded, setControlExpanded] = useState(true);
  const [adminExpanded, setAdminExpanded] = useState(true);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

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
        className={`flex items-center ${isSidebarMinimized ? 'justify-center group cursor-pointer' : 'justify-between'} pt-6 pb-4 px-5`}
        onClick={() => { if (isSidebarMinimized) setIsSidebarMinimized(false); }}
        title={isSidebarMinimized ? "Expand Sidebar" : ""}
      >
        <div className={`flex items-center gap-2.5 ${isSidebarMinimized ? 'px-0 relative' : ''}`}>
          <div className={`relative flex items-center justify-center shrink-0 transition-opacity duration-300 ${isSidebarMinimized ? 'group-hover:opacity-0' : ''}`}>
            <Cloud className="h-6 w-6 text-white" strokeWidth={1.5} />
            <Activity className="h-3 w-3 text-white absolute" strokeWidth={3} />
          </div>
          
          {isSidebarMinimized && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-white">
              <PanelLeft size={20} />
            </div>
          )}

          {!isSidebarMinimized && (
            <span className="text-white font-bold tracking-tight text-[15px] whitespace-nowrap overflow-hidden">
              Cloud Pulse Agent
            </span>
          )}
        </div>
        
        {!isSidebarMinimized && (
          <button 
            onClick={(e) => { e.stopPropagation(); setIsSidebarMinimized(true); }}
            className="text-gray-400 hover:text-white transition-colors p-1"
            title="Minimize Sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      <nav className="space-y-1 px-3">
        <div>
          <button 
            onClick={() => setControlExpanded(!controlExpanded)}
            title={isSidebarMinimized ? "Control" : ""}
            className={`w-full flex items-center ${isSidebarMinimized ? 'justify-center' : 'justify-between'} px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${location.pathname === '/control' ? 'bg-[#1a1d24] text-white' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24]'}`}
          >
            <div className={`flex items-center ${isSidebarMinimized ? 'w-full justify-center gap-1' : 'gap-3'}`}>
              <Activity className="h-4 w-4 text-purple-400 shrink-0" />
              {!isSidebarMinimized && <span className="whitespace-nowrap overflow-hidden">Control</span>}
            </div>
            {!isSidebarMinimized && (
              <div className="text-[#8b949e] hover:text-white transition-colors">
                {controlExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              </div>
            )}
          </button>
          
          {controlExpanded && (
            <div className={`mt-1 space-y-1 ${isSidebarMinimized ? 'flex flex-col items-center bg-[#15181e] py-1.5 mx-2 rounded-lg' : 'ml-6 border-l border-zinc-800/60 pl-3'}`}>
              {availableProviders.map(p => (
                <button
                  key={p}
                  title={isSidebarMinimized ? (p === 'AWS' ? 'Amazon Web Services' : p === 'GCP' ? 'Google Cloud' : 'Microsoft Azure') : ""}
                  onClick={() => {
                    handleProviderChange(p);
                    if (location.pathname !== '/control') {
                      navigate('/control');
                    }
                  }}
                  className={`flex items-center transition-colors tracking-wide ${
                    isSidebarMinimized 
                      ? `justify-center w-8 h-8 rounded-md text-[10px] font-bold ${provider === p && location.pathname === '/control' ? 'bg-[#1a1d24] text-white ring-1 ring-purple-400/50' : 'text-[#737d8c] hover:bg-[#1a1d24]/50 hover:text-white'}` 
                      : `w-full gap-3 px-3 py-1.5 rounded-md text-[12px] font-medium ${provider === p && location.pathname === '/control' ? 'text-white bg-[#1a1d24]' : 'text-[#737d8c] hover:text-zinc-300 hover:bg-[#1a1d24]/50'}`
                  }`}
                >
                  {isSidebarMinimized ? (
                    <img 
                      src={`/${p === 'AWS' ? 'aws' : p === 'GCP' ? 'gcp' : 'azure'}-logo.svg`} 
                      alt={p} 
                      className="h-5 w-5 object-contain" 
                    />
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
        <NavLink to="/inventory" title={isSidebarMinimized ? "Inventory" : ""} className={({isActive}) => `flex items-center gap-3 ${isSidebarMinimized ? 'justify-center' : ''} px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${isActive ? 'bg-[#1a1d24] text-white' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24]'}`}>
          {({isActive}) => (
            <>
              <Boxes className="h-4 w-4 text-teal-400 shrink-0" />
              {!isSidebarMinimized && <span className="whitespace-nowrap overflow-hidden">Inventory</span>}
            </>
          )}
        </NavLink>
        <NavLink to="/config" title={isSidebarMinimized ? "Configuration" : ""} className={({isActive}) => `flex items-center gap-3 ${isSidebarMinimized ? 'justify-center' : ''} px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${isActive ? 'bg-[#1a1d24] text-white' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24]'}`}>
          {({isActive}) => (
            <>
              <CloudCog className="h-4 w-4 text-cyan-400 shrink-0" />
              {!isSidebarMinimized && <span className="whitespace-nowrap overflow-hidden">Configuration</span>}
            </>
          )}
        </NavLink>
        <div>
          <button 
            onClick={() => setAdminExpanded(!adminExpanded)}
            title={isSidebarMinimized ? "Admin" : ""}
            className={`w-full flex items-center ${isSidebarMinimized ? 'justify-center' : 'justify-between'} px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${location.pathname.startsWith('/admin') ? 'bg-[#1a1d24] text-white' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1d24]'}`}
          >
            <div className={`flex items-center ${isSidebarMinimized ? 'w-full justify-center gap-1' : 'gap-3'}`}>
              <Settings className="h-4 w-4 text-amber-400 shrink-0" />
              {!isSidebarMinimized && <span className="whitespace-nowrap overflow-hidden">Admin</span>}
            </div>
            {!isSidebarMinimized && (
              <div className="text-[#8b949e] hover:text-white transition-colors">
                {adminExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              </div>
            )}
          </button>
          
          {adminExpanded && (
            <div className={`mt-1 space-y-1 ${isSidebarMinimized ? 'flex flex-col items-center bg-[#15181e] py-1.5 mx-2 rounded-lg' : 'ml-6 border-l border-zinc-800/60 pl-3'}`}>
              <NavLink
                to="/admin"
                title={isSidebarMinimized ? "Admin Console" : ""}
                className={({isActive}) => `flex items-center transition-colors tracking-wide ${
                  isSidebarMinimized 
                    ? `justify-center w-8 h-8 rounded-md text-[10px] font-bold ${isActive ? 'bg-[#1a1d24] text-white ring-1 ring-amber-400/50' : 'text-[#737d8c] hover:bg-[#1a1d24]/50 hover:text-white'}`
                    : `w-full gap-3 px-3 py-1.5 rounded-md text-[12px] font-medium ${isActive ? 'text-white bg-[#1a1d24]' : 'text-[#737d8c] hover:text-zinc-300 hover:bg-[#1a1d24]/50'}`
                }`}
              >
                {({isActive}) => isSidebarMinimized ? (
                  <span>AC</span>
                ) : (
                  <>
                    <div className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-amber-400' : 'bg-transparent'}`} />
                    Admin Console
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
