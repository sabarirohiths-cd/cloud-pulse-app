import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

export function CustomSelect({ label, value, options, onChange, width = 'max-w-[150px]', disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  
  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ref]);

  return (
    <div ref={ref} className={`relative flex items-center bg-[#1e1e24] border border-zinc-800 rounded-md px-3 py-1.5 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[#25252b]'}`} onClick={() => !disabled && setOpen(!open)}>
      <span className="text-xs text-zinc-400 mr-1">{label}</span>
      <span className={`text-xs font-semibold text-zinc-200 truncate pr-4 ${width}`}>
        {options.find(o => String(o.value) === String(value))?.label || value}
      </span>
      <ChevronDown className="absolute right-2 h-3 w-3 text-zinc-400 pointer-events-none"/>
      
      {open && (
        <div className="absolute top-full left-0 mt-1 w-max min-w-full bg-[#1e1e24] border border-zinc-700 rounded-md shadow-xl z-50 max-h-60 overflow-y-auto overflow-x-hidden">
          {options.map((opt, i) => (
            <div 
              key={i}
              className="px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer transition-colors"
              onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
