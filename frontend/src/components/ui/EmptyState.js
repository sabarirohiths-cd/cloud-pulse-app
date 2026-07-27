import React from 'react';

export function EmptyState({ icon: Icon, message, height = "h-[200px]", className = "" }) {
  return (
    <div className={`${height} flex flex-col items-center justify-center gap-3 text-zinc-500 opacity-60 ${className}`}>
      {Icon && <Icon className="h-8 w-8 stroke-[1.5]" />}
      <span className="text-xs font-medium text-center px-4">{message}</span>
    </div>
  );
}
