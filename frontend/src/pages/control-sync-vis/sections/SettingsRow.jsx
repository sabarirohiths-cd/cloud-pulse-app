import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { ResourceIcon } from '../../../components/ui/ResourceIcon';

export function SettingsRow({ r, isGroupView, toggleRow, handleToggle, setDetailResource }) {
  const isExpandable = r._isExpandable;
  const isExpanded = r._isExpanded;
  const paddingLeft = r._level ? `${r._level * 24 + 16}px` : '16px';

  const getStatusColor = (status) => {
    const s = (status || 'UNKNOWN').toUpperCase();
    if (['RUNNING', 'AVAILABLE', 'ACTIVE'].includes(s)) return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
    if (['STOPPED', 'STOPPING'].includes(s)) return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]';
    if (['STARTING', 'PENDING'].includes(s)) return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]';
    return 'bg-zinc-700';
  };

  return (
    <div 
      className="flex items-center justify-between py-1.5 pr-4 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group"
      style={{ paddingLeft }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        
        {isGroupView && (
          <div className="w-4 flex-shrink-0 flex items-center justify-center">
            {isExpandable ? (
              <button 
                onClick={() => toggleRow(r.resource_id)}
                className="p-0.5 hover:bg-white/10 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <div className="w-3.5" />
            )}
          </div>
        )}

        <div className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${r.is_visible ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20' : 'bg-zinc-800/50 text-zinc-500 ring-1 ring-white/5'}`}>
          <ResourceIcon serviceType={r.service_type} className="w-3.5 h-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(r.status)}`} title={r.status || 'UNKNOWN'} />
            <div 
              className={`text-[13px] font-semibold truncate cursor-pointer hover:text-indigo-400 hover:underline transition-colors ${r.is_visible ? 'text-zinc-200' : 'text-zinc-500'}`}
              onClick={() => setDetailResource && setDetailResource(r)}
            >
              {r.name}
            </div>
            <span className="text-[10px] text-zinc-500 font-mono truncate ml-1">
              {r.resource_id}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              {r.service_type}
            </span>
            <div className="w-1 h-1 rounded-full bg-zinc-700" />
            <span className="text-[11px] font-medium text-zinc-400">
              {r.region}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pl-4">
        <button
          onClick={() => handleToggle(r)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
            r.is_visible ? 'bg-indigo-500' : 'bg-zinc-700'
          }`}
        >
          <span className="sr-only">Toggle visibility</span>
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              r.is_visible ? 'translate-x-4.5 translate-x-[18px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
