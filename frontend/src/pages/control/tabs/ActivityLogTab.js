import React, { useState, useEffect, useCallback } from 'react';
import { History, Play, Square, CalendarClock } from 'lucide-react';
import { FilterBar } from '../../../components/ui/FilterBar';
import { TableVirtuoso } from 'react-virtuoso';
import { listAuditLogs } from '../../../api/control';

export function ActivityLogTab({ topFilters }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const [filter, setFilter] = useState({ eventType: 'All' });
  const [searchQuery, setSearchQuery] = useState('');

  const loadLogs = useCallback(async (reset = false) => {
    if (loading || (!hasMore && !reset)) return;
    
    setLoading(true);
    const currentOffset = reset ? 0 : offset;
    
    try {
      const data = await listAuditLogs({
        account: topFilters.account,
        eventType: filter.eventType,
        search: searchQuery.trim()
      }, LIMIT, currentOffset);
      
      const newLogs = data || [];
      setLogs(prev => reset ? newLogs : [...prev, ...newLogs]);
      setOffset(currentOffset + LIMIT);
      setHasMore(newLogs.length === LIMIT);
    } catch (e) {
      console.error("Failed to fetch paginated logs", e);
      if (reset) setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [topFilters.account, filter.eventType, searchQuery, offset, loading, hasMore]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadLogs(true);
    }, searchQuery ? 300 : 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topFilters.account, filter.eventType, searchQuery]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadLogs(false);
    }
  }, [loading, hasMore, loadLogs]);

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
          filters={[
            { 
              label: "Event Type:", 
              value: filter.eventType, 
              onChange: v => setFilter({ ...filter, eventType: v }), 
              options: eventOptions,
              width: "max-w-[200px]"
            }
          ]}
        />
        <div className="relative">
          <input
            type="text"
            placeholder="Search resource or action..."
            className="bg-zinc-800/50 border border-zinc-700/50 rounded-md text-xs px-3 py-1.5 w-[250px] text-zinc-300 focus:outline-none focus:border-zinc-500"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl shadow-xl">
        {logs.length > 0 ? (
          <TableVirtuoso
            useWindowScroll={!document.getElementById('main-scroll-container')}
            customScrollParent={document.getElementById('main-scroll-container')}
            data={logs}
            endReached={loadMore}
            components={{
              Table: (props) => <table {...props} className="w-full text-left text-xs" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }} />,
              TableHead: React.forwardRef((props, ref) => <thead {...props} ref={ref} className="bg-zinc-950/80 backdrop-blur-md z-20 text-zinc-400 border-b border-zinc-800 uppercase text-[10px]" />),
              TableRow: (props) => <tr {...props} className="hover:bg-zinc-800/30 transition-colors border-b border-zinc-800/20 last:border-0" />,
              TableBody: React.forwardRef((props, ref) => <tbody {...props} ref={ref} className="divide-y divide-zinc-800/60 text-zinc-300" />),
            }}
            fixedHeaderContent={() => (
              <tr>
                <th className="p-4 w-[20%]">Timestamp</th>
                <th className="p-4 w-[20%]">Event Type</th>
                <th className="p-4 w-[25%]">Resource</th>
                <th className="p-4 w-[15%]">Status</th>
                <th className="p-4 w-[20%]">Details</th>
              </tr>
            )}
            itemContent={(index, log) => (
              <>
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
                  <div className="font-semibold text-white truncate">{log.resource_name || log.native_id}</div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
                    <span className="font-mono uppercase">{log.provider}</span> • <span>{log.account_name}</span>
                  </div>
                </td>
                <td className="p-4">
                  {log.status === 'SUCCESS' ? (
                    <span className="flex items-center gap-1.5 text-green-400 bg-green-500/10 px-2 py-1 rounded-full text-[10px] font-bold w-fit">
                      SUCCESS
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-red-400 bg-red-500/10 px-2 py-1 rounded-full text-[10px] font-bold w-fit">
                      FAILED
                    </span>
                  )}
                </td>
                <td className="p-4 text-[11px] text-zinc-400">
                  {log.details || '-'}
                </td>
              </>
            )}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
            {loading ? (
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <History className="h-10 w-10 mb-3 text-zinc-600" />
                <p>No activity logs found for the current filters.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
