import React, { useState, useEffect, useCallback } from 'react';
import { Server, Database, Clock, Search } from 'lucide-react';
import { TableVirtuoso } from 'react-virtuoso';
import { FilterBar } from '../../../components/ui/FilterBar';
import { toast } from 'sonner';
import { listResources, togglePower, saveSchedule, getLiveState, logAction } from '../../../api/control';
import ActionModal from '../ActionModal';

export function ResourcesTab({ topFilters, onActionLogged }) {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const [filter, setFilter] = useState({
    group: 'All',
    type: 'All',
    powerState: 'All'
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [modalState, setModalState] = useState({ isOpen: false, mode: null, resource: null });

  const loadResources = async (reset = false) => {
    if (loading || (!hasMore && !reset)) return;
    
    setLoading(true);
    const currentOffset = reset ? 0 : offset;
    
    try {
      const data = await listResources(topFilters, LIMIT, currentOffset);
      const mapped = (data || []).map(s => ({
        resource_id: s.resource_id,
        name: s.resource_name || s.resource_id,
        service_type: s.service_type,
        control_type: s.control_type,
        account_name: s.account_name,
        region: s.region,
        cloud_provider: s.cloud_provider || 'aws',
        instance_spec: s.instance_spec || 'unknown',
        tags_json: s.tags_json,
        status: s.status || 'UNKNOWN',
        schedule: {
          is_automation_enabled: s.is_automation_enabled,
          start_time: s.start_time,
          stop_time: s.stop_time,
          timezone: s.timezone
        }
      }));

      if (reset) {
        setResources(mapped);
      } else {
        setResources(prev => [...prev, ...mapped]);
      }
      
      setOffset(currentOffset + mapped.length);
      setHasMore(mapped.length === LIMIT);
    } catch (err) {
      toast.error('Failed to load resources');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setHasMore(true);
    setOffset(0);
    loadResources(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topFilters.account, topFilters.provider, topFilters.region, topFilters.tag]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadResources(false);
    }
  }, [loading, hasMore, offset, topFilters]);

  // Real-Time Polling Engine
  useEffect(() => {
    const transitioningResources = resources.filter(r =>
      !['RUNNING', 'STOPPED', 'UNKNOWN'].includes(r.status.toUpperCase())
    );

    if (transitioningResources.length === 0) return;

    const interval = setInterval(() => {
      transitioningResources.forEach(async (r) => {
        try {
          const liveData = await getLiveState({
            provider: r.cloud_provider,
            region: r.region,
            serviceType: r.service_type,
            resourceId: r.resource_id,
            accountName: r.account_name
          });

          if (liveData.status && liveData.status.toUpperCase() !== r.status.toUpperCase()) {
            const newState = liveData.status.toUpperCase();
            const oldState = r.status.toUpperCase();

            if (oldState === 'STOPPING' && newState === 'RUNNING') return;
            if (oldState === 'STARTING' && newState === 'STOPPED') return;

            if (oldState !== 'RUNNING' && newState === 'RUNNING') {
              toast.success(`Resource ${r.name || r.resource_id} is completely ON!`);
              logAction({
                resource_id: r.resource_id, service_type: r.service_type,
                account_name: r.account_name, region: r.region,
                action_type: 'MANUAL_START', status: 'SUCCESS', details: `Started successfully.`
              });
              if (onActionLogged) onActionLogged();
            } else if (oldState !== 'STOPPED' && newState === 'STOPPED') {
              toast.success(`Resource ${r.name || r.resource_id} is completely OFF!`);
              logAction({
                resource_id: r.resource_id, service_type: r.service_type,
                account_name: r.account_name, region: r.region,
                action_type: 'MANUAL_STOP', status: 'SUCCESS', details: `Stopped successfully.`
              });
              if (onActionLogged) onActionLogged();
            }

            setResources(prev => prev.map(res =>
              res.resource_id === r.resource_id ? { ...res, status: newState } : res
            ));
          }
        } catch (e) {
          console.error(`Failed to poll state for ${r.resource_id}`, e);
        }
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [resources]);

  const handleModalConfirm = async ({ mode, resource, automationEnabled, startTime, stopTime, timezone }) => {
    try {
      if (mode === 'schedule') {
        await saveSchedule({
          resource_id: resource.resource_id,
          service_type: resource.service_type,
          account_name: resource.account_name,
          region: resource.region,
          is_automation_enabled: automationEnabled,
          start_time: startTime,
          stop_time: stopTime,
          timezone: timezone
        });

        setResources(prev => prev.map(r => r.resource_id === resource.resource_id ? {
          ...r,
          schedule: { is_automation_enabled: automationEnabled, start_time: startTime, stop_time: stopTime, timezone: timezone }
        } : r));

        toast.success(`Schedule saved for ${resource.resource_id}`);
      } else if (mode === 'start' || mode === 'stop') {
        const optimisticState = mode === 'start' ? 'STARTING' : 'STOPPING';
        setResources(prev => prev.map(r => r.resource_id === resource.resource_id ? { ...r, status: optimisticState } : r));

        await togglePower({
          resource_id: resource.resource_id,
          service_type: resource.service_type,
          account_name: resource.account_name,
          region: resource.region,
          action: mode.toUpperCase()
        });

        toast.success(`Resource is now ${optimisticState.toLowerCase()}`);
      }
    } catch (e) {
      toast.error(`Action Blocked: ${e.response?.data?.detail || 'Operation failed'}`);
      setResources(prev => prev.map(r => r.resource_id === resource.resource_id ? resource : r));
    } finally {
      setModalState({ isOpen: false, mode: null, resource: null });
      if (onActionLogged) onActionLogged();
    }
  };

  const getGroup = (type) => {
    const t = (type || '').toUpperCase();
    if (['RDS', 'AURORA'].includes(t)) return 'RDS';
    if (['EC2'].includes(t)) return 'EC2';
    return t;
  };

  const uniqueGroups = Array.from(new Set(resources.map(r => getGroup(r.service_type))));

  const filteredResources = resources
    .filter(r => filter.group === 'All' || getGroup(r.service_type) === filter.group)
    .filter(r => filter.type === 'All' || (r.service_type || '').toUpperCase() === filter.type)
    .filter(r => filter.powerState === 'All' || r.status === filter.powerState)
    .filter(r => 
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.resource_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.account_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const groupOptions = [
    { label: 'All Groups', value: 'All' },
    ...uniqueGroups.map(g => ({ label: g.toUpperCase(), value: g }))
  ];
  
  const availableTypesForGroup = Array.from(new Set(resources.filter(r => {
    if (!filter.group || filter.group === 'All') return true;
    return getGroup(r.service_type) === filter.group;
  }).map(r => (r.service_type || '').toUpperCase())));

  const typeOptions = [
    { label: 'All Types', value: 'All' },
    ...availableTypesForGroup.map(type => ({ label: type, value: type }))
  ];
  
  const powerStateOptions = [
    { label: 'All States', value: 'All' },
    { label: 'Running', value: 'RUNNING' },
    { label: 'Stopped', value: 'STOPPED' }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <FilterBar 
          showLabel={true}
          className="flex items-center gap-4 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/50"
          filters={[
            { label: "Group:", value: filter.group, onChange: v => setFilter({ ...filter, group: v, type: 'All' }), options: groupOptions, width: "max-w-[130px]" },
            { label: "Type:", value: filter.type, onChange: v => setFilter({ ...filter, type: v }), options: typeOptions, width: "max-w-[150px]" },
            { label: "State:", value: filter.powerState, onChange: v => setFilter({ ...filter, powerState: v }), options: powerStateOptions, width: "max-w-[130px]" }
          ]}
        />

        <div className="relative w-64">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search loaded resources..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#1e1e24] border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl shadow-xl">
        {filteredResources.length > 0 ? (
          <TableVirtuoso
            useWindowScroll={!document.getElementById('main-scroll-container')}
            customScrollParent={document.getElementById('main-scroll-container')}
            data={filteredResources}
            endReached={loadMore}
            components={{
              Table: (props) => <table {...props} className="w-full text-left text-xs" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }} />,
              TableHead: React.forwardRef((props, ref) => <thead {...props} ref={ref} className="bg-zinc-950/80 backdrop-blur-md z-20 text-zinc-400 border-b border-zinc-800 uppercase text-[10px]" />),
              TableRow: (props) => <tr {...props} className="hover:bg-zinc-800/30 transition-colors" />,
              TableBody: React.forwardRef((props, ref) => <tbody {...props} ref={ref} className="divide-y divide-zinc-800/60 text-zinc-300" />),
            }}
            fixedHeaderContent={() => (
              <tr>
                <th className="p-4 w-[35%]">Resource Name</th>
                <th className="p-4 w-[10%]">Service</th>
                <th className="p-4 w-[15%]">Region</th>
                <th className="p-4 w-[15%]">Status</th>
                <th className="p-4 w-[15%]">Automated Schedule</th>
                <th className="p-4 w-[10%] text-right">Actions</th>
              </tr>
            )}
            itemContent={(index, r) => {
              let tags = {};
              try {
                if (r.tags_json) tags = typeof r.tags_json === 'string' ? JSON.parse(r.tags_json) : r.tags_json;
              } catch (e) {}
              
              const isAsgManaged = !!tags['aws:autoscaling:groupName'];
              const asgName = tags['aws:autoscaling:groupName'];
              const isScaleToZero = r.control_type === 'SCALE_TO_ZERO';

              return (
                <>
                <td className="p-4 truncate">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded bg-zinc-800/50 shrink-0">
                      {r.service_type?.toLowerCase() === 'ec2' ? <Server className="w-3.5 h-3.5 text-zinc-400" /> : <Database className="w-3.5 h-3.5 text-zinc-400" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-zinc-200 truncate">{r.name}</div>
                      {r.resource_id && r.resource_id !== r.name && (
                        <div className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">
                          {r.resource_id}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-4 text-[13px] text-zinc-400 font-medium uppercase">{r.service_type}</td>
                <td className="p-4 text-[13px] text-zinc-400 font-medium">{r.region}</td>
                <td className="p-4 flex flex-col items-start gap-1 justify-center min-h-[50px]">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.status==='RUNNING'?'bg-green-500/10 text-green-400 border border-green-500/20':'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                    {r.status}
                  </span>
                  {isAsgManaged && (
                    <span 
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 cursor-help"
                      title={`Power actions for this instance are controlled by Auto Scaling Group: ${asgName}`}
                    >
                      ASG Managed
                    </span>
                  )}
                </td>
                <td className="p-4 text-[13px] text-zinc-400">
                  {r.schedule?.is_automation_enabled ? (
                    <div className="flex items-center gap-1.5 text-blue-400 font-medium">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="font-mono">{r.schedule.start_time} - {r.schedule.stop_time}</span>
                    </div>
                  ) : (
                    <span className="text-zinc-500 italic text-xs">Manual</span>
                  )}
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => setModalState({ isOpen: true, mode: 'schedule', resource: r })}
                      className="px-2.5 py-1 text-[11px] font-medium bg-zinc-800 text-zinc-300 hover:text-white rounded border border-zinc-700 hover:bg-zinc-700 transition-colors"
                    >
                      Schedule
                    </button>
                    {r.status === 'RUNNING' ? (
                      <button 
                        onClick={() => setModalState({ isOpen: true, mode: 'stop', resource: r })}
                        disabled={isAsgManaged}
                        title={isAsgManaged ? `Controlled by ASG: ${asgName}` : ''}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded transition-colors ${
                          isAsgManaged 
                            ? 'bg-zinc-800 text-zinc-600 border border-zinc-800 cursor-not-allowed' 
                            : 'bg-red-600/10 text-red-500 hover:bg-red-600/20 border border-red-600/20'
                        }`}
                      >
                        {isScaleToZero ? 'SCALE TO ZERO' : 'STOP'}
                      </button>
                    ) : (
                      <button 
                        onClick={() => setModalState({ isOpen: true, mode: 'start', resource: r })}
                        disabled={isAsgManaged}
                        title={isAsgManaged ? `Controlled by ASG: ${asgName}` : ''}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded transition-colors ${
                          isAsgManaged 
                            ? 'bg-zinc-800 text-zinc-600 border border-zinc-800 cursor-not-allowed' 
                            : 'bg-green-600/10 text-green-500 hover:bg-green-600/20 border border-green-600/20'
                        }`}
                      >
                        START
                      </button>
                    )}
                  </div>
                </td>
                </>
              );
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500">
            <Database className="w-8 h-8 mb-3 opacity-20" />
            <p>No resources found.</p>
          </div>
        )}
      </div>

      <ActionModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, mode: null, resource: null })}
        mode={modalState.mode}
        resource={modalState.resource}
        onConfirm={handleModalConfirm}
      />
    </div>
  );
}
