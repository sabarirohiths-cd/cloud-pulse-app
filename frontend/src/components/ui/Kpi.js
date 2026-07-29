import React from 'react';

export function Kpi({label, value, color='text-white', icon, onClick}) {
  return (
    <div 
      className={`bg-[#131315] border border-[#26262b] rounded-xl p-4 ${onClick ? 'cursor-pointer hover:bg-[#1a1a1c] hover:border-[#333338] transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">{label}</p>
        {icon && <span className={color}>{icon}</span>}
      </div>
      <p className={`text-2xl font-bold ${color}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
