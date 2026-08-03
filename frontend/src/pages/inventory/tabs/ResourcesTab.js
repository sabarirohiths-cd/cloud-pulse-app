import React from 'react';
import { Eye, Server } from 'lucide-react';
import { TableVirtuoso } from 'react-virtuoso';
import { formatType, formatIdentifier, formatName } from '../../../utils/ui-utils';
import { FilterBar } from '../../../components/ui/FilterBar';
import { EmptyState } from '../../../components/ui/EmptyState';
import { TableSkeleton } from '../../../components/ui/TableSkeleton';
import { getResources } from '../../../api/inventory';
import { getStrategy } from '../../../utils/cloud-strategies';

export function ResourcesTab({ filter, setFilter, dynamicGroups, dynamicTypes, dynamicRegions, setSelectedResource, provider, account, topFilters }) {
  const [resources, setResources] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);
  const [offset, setOffset] = React.useState(0);
  
  const strategy = getStrategy(provider);

  const LIMIT = 50;

  const fetchResources = React.useCallback(async (reset = false) => {
    if (loading || (!hasMore && !reset)) return;
    setLoading(true);

    try {
      const currentOffset = reset ? 0 : offset;

      // If group is selected but no specific type, get all types in that group
      let typeParam = filter.type;
      if (filter.group !== 'All' && filter.type === 'All') {
        // dynamicTypes from InventoryPage is ALREADY filtered down to the current filter.group!
        const groupTypes = dynamicTypes.map(t => t.type);
        if (groupTypes.length > 0) {
          typeParam = groupTypes.join(',');
        } else {
          // No types match this group, so return empty immediately
          setResources(reset ? [] : resources);
          setHasMore(false);
          setLoading(false);
          return;
        }
      }

      console.log("Fetching resources with typeParam:", typeParam, "filter:", filter);

      const res = await getResources(
        provider,
        null, // configId
        typeParam,
        filter.region === 'All' ? topFilters.region : filter.region,
        filter.billable,
        account,
        'active',
        LIMIT,
        currentOffset,
        topFilters.linked,
        topFilters.tag,
        filter.time
      );

      const newResources = res.data.resources;
      
      setResources(prev => reset ? newResources : [...prev, ...newResources]);
      setOffset(currentOffset + LIMIT);
      setHasMore(newResources.length === LIMIT);
    } catch (e) {
      console.error("Failed to fetch paginated resources", e);
    } finally {
      setLoading(false);
    }
  }, [account, provider, filter, topFilters, offset, loading, hasMore, dynamicTypes, resources]);

  // Reset and fetch when filters change
  React.useEffect(() => {
    setHasMore(true);
    setOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, provider, filter, topFilters]);

  // Actually trigger the fetch when offset is 0 and hasMore is true (meaning a reset just happened)
  React.useEffect(() => {
    if (offset === 0 && hasMore && !loading) {
      fetchResources(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, hasMore, fetchResources]);

  const loadMore = () => {
    if (!loading && hasMore) {
      fetchResources(false);
    }
  };
  return (
    <div>
      <FilterBar
        showLabel={true}
        className="flex flex-wrap items-center gap-4 mb-4"
        filters={[
          { label: "Group:", value: filter.group, onChange: v => setFilter({ ...filter, group: v, type: 'All' }), options: [{ label: 'All Services', value: 'All' }, ...dynamicGroups.map(g => ({ label: `${g.group.toUpperCase()} (${g.count})`, value: g.group }))], width: "max-w-[160px]" },
          { label: "Type:", value: filter.type, onChange: v => setFilter({ ...filter, type: v }), options: [{ label: 'All Types', value: 'All' }, ...(filter.group === 'All' ? [] : dynamicTypes.map(t => ({ label: `${formatType(t.type, provider)} (${t.count})`, value: t.type })))], width: "max-w-[200px]" },
          { label: "Region:", value: filter.region, onChange: v => setFilter({ ...filter, region: v }), options: [{ label: 'All Regions', value: 'All' }, ...dynamicRegions.map(r => ({ label: `${r.region} (${r.count})`, value: r.region }))], width: "max-w-[160px]" },
          { label: "Billable:", value: filter.billable, onChange: v => setFilter({ ...filter, billable: v }), options: [{ label: 'All Statuses', value: 'All' }, { label: 'Billable', value: 'true' }, { label: 'Non-Billable', value: 'false' }], width: "w-[90px]" },
          { label: "Time:", value: filter.time, onChange: v => setFilter({ ...filter, time: v }), options: [{ label: 'All Time', value: 'All' }, { label: 'Today', value: 'Today' }], width: "w-[70px]" }
        ]}
      />

      <div className="bg-[#111114] border border-[#1f1f24] rounded-xl [overflow:clip]">
        {(resources.length === 0 && (loading || (offset === 0 && hasMore))) ? (
          <div className="h-[600px] w-full">
            <TableSkeleton />
          </div>
        ) : resources.length > 0 ? (
          <TableVirtuoso
            useWindowScroll={!document.getElementById('main-scroll-container')}
            customScrollParent={document.getElementById('main-scroll-container')}
            data={resources}
            endReached={loadMore}
            components={{
              Table: (props) => <table {...props} className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }} />,
              TableHead: React.forwardRef((props, ref) => <thead {...props} ref={ref} className="sticky top-0 z-20" />),
              TableRow: (props) => <tr {...props} className="hover:bg-zinc-800/30 transition-colors border-b border-zinc-800/20 last:border-0" />,
              TableBody: React.forwardRef((props, ref) => <tbody {...props} ref={ref} className="divide-y divide-zinc-800/30" />),
            }}
            fixedHeaderContent={() => (
              <tr className="bg-[#0a0a0f]">
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-zinc-400 uppercase w-[40%] bg-[#111114] rounded-tl-xl border-b border-[#1f1f24]">Identifier</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-zinc-400 uppercase w-[25%] bg-[#111114] border-b border-[#1f1f24]">Type</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-zinc-400 uppercase w-[15%] bg-[#111114] border-b border-[#1f1f24]">Region</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-zinc-400 uppercase w-[10%] bg-[#111114] border-b border-[#1f1f24]">Billable</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-zinc-400 uppercase w-[10%] bg-[#111114] rounded-tr-xl border-b border-[#1f1f24]">Actions</th>
              </tr>
            )}
            itemContent={(index, r) => (
              <>
                <td className="px-4 py-3 truncate">
                  <div className="text-sm font-semibold text-white truncate">{formatName(r.name, r.native_id, r.provider) || formatIdentifier(r.native_id, r.provider)}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{formatIdentifier(r.native_id, r.provider)}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-1 bg-zinc-800/50 text-zinc-300 rounded border border-zinc-700/50">{formatType(r.resource_type, r.provider)}</span>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-400">{r.region}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${r.billable ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-700/50 text-zinc-500'}`}>{r.billable ? 'Yes' : 'No'}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setSelectedResource(r)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 rounded-md transition-colors">
                    <Eye className="h-3 w-3" /> View
                  </button>
                </td>
              </>
            )}
          />
        ) : (
          <EmptyState icon={Server} message="No resources found." height="h-full py-24" />
        )}
      </div>
    </div>
  );
}
