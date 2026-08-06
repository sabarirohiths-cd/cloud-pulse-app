import React from 'react';
import { Server, Database, ChevronRight, ChevronDown } from 'lucide-react';

export function SettingsRow({ r, isGroupView, toggleRow, handleToggle }) {
  const isExpandable = r._isExpandable;
  const isExpanded = r._isExpanded;
  const paddingLeft = r._level ? `${r._level * 24 + 16}px` : '16px';

  return (
    <div 
      className="flex items-center justify-between py-2 pr-4 border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors group"
      style={{ paddingLeft }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        
        {isGroupView && (
          <div className="w-4 flex-shrink-0 flex items-center justify-center">
            {isExpandable ? (
              <button 
                onClick={() => toggleRow(r.resource_id)}
                className="p-0.5 hover:bg-zinc-700/50 rounded text-zinc-400 hover:text-white transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <div className="w-3.5" /> // spacer
            )}
          </div>
        )}

        <div className={`flex-shrink-0 p-1.5 rounded-lg ${r.is_visible ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-500'}`}>
          {r.service_type?.toLowerCase() === 'ec2' ? (
            <Server className="w-3.5 h-3.5" />
          ) : (
            <Database className="w-3.5 h-3.5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className={`text-[12px] font-semibold truncate ${r.is_visible ? 'text-zinc-100' : 'text-zinc-500'}`}>
            {r.name}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[200px]">
              {r.resource_id}
            </span>
            <span className="text-[9px] font-semibold text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
              {r.service_type}
            </span>
            <span className="text-[9px] font-semibold text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded-sm">
              {r.region}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pl-4">
        {r.is_visible ? (
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
            Visible
          </span>
        ) : (
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
            Hidden
          </span>
        )}
        
        {/* iOS Style Toggle Switch - Compacted */}
        <button
          onClick={() => handleToggle(r)}
          className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            r.is_visible ? 'bg-blue-500' : 'bg-zinc-700'
          }`}
          role="switch"
          aria-checked={r.is_visible}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
              r.is_visible ? 'translate-x-[11px]' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
