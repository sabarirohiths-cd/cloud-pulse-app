import React, { useState } from 'react';
import { History, Search, Play, Square, CalendarClock, CheckCircle2, XCircle } from 'lucide-react';
import { FilterBar } from '../../../components/ui/FilterBar';

export function ActivityLogTab({ logs, topFilters }) {
  const [filter, setFilter] = useState({
    eventType: 'All'
  });
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = (logs || [])
    .filter(log => (topFilters.account === 'All Accounts' || log.account_name === topFilters.account))
    .filter(log => {
      if (filter.eventType === 'All') return true;
      if (filter.eventType === 'power') return log.action_type.startsWith('MANUAL_');
      if (filter.eventType === 'schedule') return log.action_type === 'SCHEDULE_UPDATED';
      return true;
    })
    .filter(log => 
      log.native_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.resource_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action_type.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const eventOptions = [
    { label: 'All Events', value: 'All' },
    { label: 'Power Executions', value: 'power' },
    { label: 'Schedule Modifications', value: 'schedule' }
  ];

  const getActionIcon = (actionType) => {
    if (actionType.includes('START')) return <Play className="h-4 w-4 text-green-500" />;
    if (actionType.includes('STOP')) return <Square className="h-4 w-4 text-red-500" />;
    if (actionType.includes('SCHEDULE')) return <CalendarClock className="h-4 w-4 text-blue-500" />;
    return <History className="h-4 w-4 text-zinc-400" />;
  };

  const formatDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleString(undefined, { 
      month: 'short', day: 'numeric', 
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <FilterBar 
          showLabel={true}
          className="flex items-center gap-4 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/50"
          filters={[
            { label: "Event Type:", value: filter.eventType, onChange: v => setFilter({ ...filter, eventType: v }), options: eventOptions, width: "max-w-[180px]" }
          ]}
        />

        <div className="relative w-64">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search events..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#1e1e24] border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800 uppercase text-[10px]">
            <tr>
              <th className="p-4">Timestamp</th>
              <th className="p-4">Event Type</th>
              <th className="p-4">Resource</th>
              <th className="p-4">Status</th>
              <th className="p-4">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
            {filteredLogs.map(log => (
              <tr key={log.id} className="hover:bg-zinc-800/30 transition-colors">
                <td className="p-4 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                  {formatDate(log.timestamp + 'Z')}
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2 font-medium">
                    {getActionIcon(log.action_type)}
                    <span className="text-zinc-200">{log.action_type.replace(/_/g, ' ')}</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="font-semibold text-white">{log.resource_name || log.native_id}</div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
                    <span className="font-mono uppercase">{log.provider}</span> • <span>{log.account_name}</span>
                  </div>
                </td>
                <td className="p-4">
                  {log.status === 'SUCCESS' ? (
                    <span className="flex items-center gap-1.5 text-green-400 bg-green-500/10 px-2 py-1 rounded-full text-[10px] font-bold w-fit">
                      <CheckCircle2 className="h-3 w-3" /> SUCCESS
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-red-400 bg-red-500/10 px-2 py-1 rounded-full text-[10px] font-bold w-fit">
                      <XCircle className="h-3 w-3" /> FAILED
                    </span>
                  )}
                </td>
                <td className="p-4 text-zinc-400 text-[11px] max-w-xs truncate" title={log.details}>
                  {log.details || '-'}
                </td>
              </tr>
            ))}
            
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center">
                  <History className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-zinc-400">No Activity Found</h3>
                  <p className="text-xs text-zinc-600 mt-1">Actions performed on your resources will appear here.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
