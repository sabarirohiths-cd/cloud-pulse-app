import React from 'react';

export function Kpi({label, value, color='text-white', icon, onClick}) {
  return (
    <div 
      className={`bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-3.5 ${onClick ? 'cursor-pointer hover:bg-zinc-800/80 hover:border-zinc-700/50 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[9px] text-zinc-500 uppercase tracking-wider">{label}</p>
        {icon && <span className={color}>{icon}</span>}
      </div>
      <p className={`text-xl font-bold ${color}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
