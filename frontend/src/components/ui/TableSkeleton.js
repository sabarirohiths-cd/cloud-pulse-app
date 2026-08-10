import React from 'react';

export function TableSkeleton() {
  return (
    <div 
      className="w-full h-64 flex flex-col items-center justify-center gap-4 bg-[#111114]/50 border border-[#1f1f24] rounded-xl opacity-0"
      style={{ animation: 'fadeIn 0.3s ease-in-out 0.15s forwards' }}
    >
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Fetching...</span>
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
