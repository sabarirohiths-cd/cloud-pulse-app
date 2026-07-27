import React, { useState, useEffect, useCallback } from 'react';
import { History } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { formatType, formatIdentifier } from '../../../utils/ui-utils';
import { EmptyState } from '../../../components/ui/EmptyState';
import { CustomSelect } from '../../../components/ui/CustomSelect';
import { getChanges } from '../../../api/inventory';

export function ChangesTab({ topFilters, setTopFilters, provider, account }) {
  const [changeFilter, setChangeFilter] = useState('All');
  const [search, setSearch] = useState('');

  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const LIMIT = 50;

  const fetchChanges = useCallback(async (reset = false) => {
    if (!account) return;
    if (loading || (!hasMore && !reset)) return;

    setLoading(true);
    try {
      const currentOffset = reset ? 0 : offset;

      const res = await getChanges(
        provider,
        null, // configId
        topFilters.range,
        account,
        changeFilter,
        search.trim(),
        LIMIT,
        currentOffset
      );

      const newChanges = res.data.changes || [];

      setChanges(prev => reset ? newChanges : [...prev, ...newChanges]);
      setTotalCount(res.data.total || 0);
      setOffset(currentOffset + LIMIT);
      setHasMore(newChanges.length === LIMIT);
    } catch (e) {
      console.error(e);
      if (reset) setChanges([]);
    } finally {
      setLoading(false);
    }
  }, [account, provider, topFilters.range, changeFilter, search, offset, loading, hasMore]);

  // Fetch on mount or when filters change
  useEffect(() => {
    // Debounce search slightly to avoid spamming the backend
    const timeout = setTimeout(() => {
      fetchChanges(true);
    }, search ? 300 : 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, topFilters.range, changeFilter, search]);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl">
      <div className="sticky -top-6 z-20 bg-zinc-900/90 backdrop-blur-md rounded-t-xl px-5 py-3 border-b border-zinc-800/50 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            Recent Changes
            <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{totalCount}</span>
          </h3>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex gap-2">
            <CustomSelect
              value={changeFilter}
              onChange={setChangeFilter}
              options={[
                { value: 'All', label: 'All Changes' },
                { value: 'created', label: 'Created' },
                { value: 'updated', label: 'Updated' },
                { value: 'deleted', label: 'Deleted' },
              ]}
              width="w-[140px]"
            />
            <div className="relative">
              <input
                type="text"
                placeholder="Search resources..."
                className="bg-zinc-800/50 border border-zinc-700/50 rounded-md text-xs px-3 py-1.5 w-[200px] text-zinc-300 focus:outline-none focus:border-zinc-500"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        <span className="text-[10px] font-medium text-zinc-400 bg-zinc-800/50 px-2 py-1 rounded-md border border-zinc-700/50">
          {{ 1: 'Today', 7: 'Last 7 days', 14: 'Last 14 days', 30: 'Last 30 days', 90: 'Last 3 months', 180: 'Last 6 months', 365: 'Last 1 year' }[topFilters.range] || `${topFilters.range} days`}
        </span>
      </div>

      <div>
        {loading && changes.length === 0 ? (
          <div className="py-20 flex items-center justify-center bg-zinc-900/20 z-10">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : changes.length > 0 ? (
          <Virtuoso
            useWindowScroll={!document.getElementById('main-scroll-container')}
            customScrollParent={document.getElementById('main-scroll-container')}
            data={changes}
            endReached={() => {
              if (hasMore && !loading) {
                fetchChanges(false);
              }
            }}
            itemContent={(index, c) => (
              <div className="px-5 py-3 flex flex-col gap-2 hover:bg-zinc-800/20 border-b border-zinc-800/30 last:border-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${c.change_type === 'created' ? 'bg-green-400' : c.change_type === 'deleted' ? 'bg-red-400' : 'bg-amber-400'}`} />
                    <div>
                      <span className="text-xs text-zinc-200">{formatIdentifier(c.native_id, provider)}</span>
                      <div className="text-[10px] text-zinc-500">{formatType(c.resource_type, provider)} • {c.region || 'Unknown'}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.change_type === 'created' ? 'bg-green-500/10 text-green-400' : c.change_type === 'deleted' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {c.change_type === 'created' ? '+ New' : c.change_type === 'deleted' ? '− Deleted' : '~ Updated'}
                    </span>
                    <div className="text-[9px] text-zinc-600 mt-1">
                      {(() => {
                        const d = new Date(c.detected_at + (c.detected_at.includes('Z') ? '' : 'Z'));
                        if (isNaN(d.getTime())) return c.detected_at;
                        return `${d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} ${d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })}`;
                      })()}
                    </div>
                  </div>
                </div>
                {c.change_type === 'updated' && c.details && Object.keys(c.details).length > 0 && (
                  <div className="ml-8 p-2 bg-zinc-900/40 rounded border border-zinc-800/50 text-[10px]">
                    {Object.entries(c.details).map(([key, diff]) => {
                      const parseVal = (v) => {
                        if (typeof v === 'string') {
                          try { return JSON.parse(v); } catch (e) { return v; }
                        }
                        return v;
                      };
                      const oldVal = parseVal(diff.old);
                      const newVal = parseVal(diff.new);

                      const formatVal = (v) => {
                        if (typeof v === 'object' && v !== null) {
                          return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(', ');
                        }
                        return String(v);
                      };

                      const renderObjectDiff = (oldObj, newObj) => {
                        const allKeys = Array.from(new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]));
                        const lines = [];
                        for (const k of allKeys) {
                          const oldV = (oldObj || {})[k];
                          const newV = (newObj || {})[k];
                          if (oldV !== newV) {
                            if (oldV === undefined) {
                              lines.push(<div key={k} className="text-green-400/90">+ {k}: {String(newV)}</div>);
                            } else if (newV === undefined) {
                              lines.push(<div key={k} className="text-red-400/90 line-through">- {k}: {String(oldV)}</div>);
                            } else {
                              lines.push(
                                <div key={k} className="text-amber-400/90 flex items-center gap-1">
                                  <span>~ {k}:</span>
                                  <span className="line-through opacity-70">{String(oldV)}</span>
                                  <span>→</span>
                                  <span>{String(newV)}</span>
                                </div>
                              );
                            }
                          }
                        }
                        return lines.length > 0 ? lines : <div className="text-zinc-500 italic">No visible changes</div>;
                      };

                      return (
                        <div key={key} className="flex flex-col gap-1 mb-2 last:mb-0">
                          <span className="text-zinc-400 capitalize font-medium">{key.replace('_', ' ')} Changed</span>
                          {typeof oldVal === 'object' && typeof newVal === 'object' && oldVal !== null && newVal !== null ? (
                            <div className="ml-2 pl-2 border-l border-zinc-700/50 flex flex-col gap-0.5 font-mono text-[9px]">
                              {renderObjectDiff(oldVal, newVal)}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-red-400/80 line-through truncate max-w-[150px] px-1.5 py-0.5 bg-red-500/10 rounded">{formatVal(oldVal) || 'None'}</span>
                              <span className="text-zinc-600">→</span>
                              <span className="text-green-400/80 truncate max-w-[200px] px-1.5 py-0.5 bg-green-500/10 rounded">{formatVal(newVal) || 'None'}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            components={{
              Footer: () => loading && changes.length > 0 ? (
                <div className="py-4 flex justify-center">
                  <div className="w-5 h-5 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : null
            }}
          />
        ) : (
          <EmptyState icon={History} message="No changes found." height="h-full" />
        )}
      </div>
    </div>
  );
}
