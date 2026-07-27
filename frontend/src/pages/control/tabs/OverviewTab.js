import React from 'react';
import { Power, Clock } from 'lucide-react';

export function OverviewTab({ runningCount, stoppedCount, activeSchedulesCount }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider block">Running Workloads</span>
            <span className="text-2xl font-bold text-green-400 mt-1 block">{runningCount}</span>
          </div>
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl"><Power className="h-5 w-5 text-green-400"/></div>
        </div>
        <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider block">Stopped Workloads</span>
            <span className="text-2xl font-bold text-amber-400 mt-1 block">{stoppedCount}</span>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl"><Power className="h-5 w-5 text-amber-400"/></div>
        </div>
        <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider block">Automated Schedules</span>
            <span className="text-2xl font-bold text-blue-400 mt-1 block">{activeSchedulesCount} Active</span>
          </div>
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl"><Clock className="h-5 w-5 text-blue-400"/></div>
        </div>
      </div>
      
      {/* Placeholder for future charting or heatmap similar to reference UX */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 min-h-[300px] flex items-center justify-center">
        <div className="text-center">
          <Clock className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">Activity Heatmap & Analytics coming soon...</p>
        </div>
      </div>
    </div>
  );
}
