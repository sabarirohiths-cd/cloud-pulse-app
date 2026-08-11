import React from 'react';
import { Power, Clock, Server } from 'lucide-react';
import { Kpi } from '../../../components/ui/Kpi';

export function OverviewTab({ totalCount, runningCount, stoppedCount, activeSchedulesCount }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <Kpi 
          label="Total Resources" 
          value={totalCount} 
          icon={<Server className="h-4 w-4" />} 
          subtext="all managed instances"
        />
        <Kpi 
          label="Running Workloads" 
          value={runningCount} 
          color="text-green-400"
          icon={<Power className="h-4 w-4" />} 
          subtextColor="text-green-500/80"
          subtext={totalCount ? `${((runningCount / totalCount) * 100).toFixed(1)}% of total` : '0%'}
        />
        <Kpi 
          label="Stopped Workloads" 
          value={stoppedCount} 
          color="text-amber-400"
          icon={<Power className="h-4 w-4" />} 
          subtextColor="text-amber-500/80"
          subtext={totalCount ? `${((stoppedCount / totalCount) * 100).toFixed(1)}% of total` : '0%'}
        />
        <Kpi 
          label="Automated Schedules" 
          value={`${activeSchedulesCount} Active`} 
          color="text-blue-400"
          icon={<Clock className="h-4 w-4" />} 
          subtextColor="text-blue-500/80"
          subtext="currently managed"
        />
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
