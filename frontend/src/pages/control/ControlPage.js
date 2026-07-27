import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getControlSummary, getFilterOptions, syncResources, listAuditLogs } from '../../api/control';
import { listConfigs } from '../../api/config';
import { FilterBar } from '../../components/ui/FilterBar';

import { OverviewTab } from './tabs/OverviewTab';
import { ActivityLogTab } from './tabs/ActivityLogTab';
import { ResourcesTab } from './tabs/ResourcesTab';

export default function ControlPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary] = useState({ running_count: 0, stopped_count: 0, active_schedules_count: 0 });
  const [loading, setLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);

  // Global filters mimicking the reference UI
  const [topFilters, setTopFilters] = useState({
    provider: 'AWS',
    account: 'All Accounts',
    region: 'All Regions',
    tag: 'All Tags',
    range: 30
  });

  const [verifiedConfigs, setVerifiedConfigs] = useState([]);
  
  const uniqueProviders = [...new Set(verifiedConfigs.map(c => (c.provider || '').toUpperCase()))].sort();
  const availableProviders = uniqueProviders.length > 0 ? uniqueProviders : ['AWS', 'AZURE', 'GCP'];
  
  const filteredConfigs = verifiedConfigs.filter(c => (c.provider || '').toUpperCase() === topFilters.provider);
  const availableAccounts = ['All Accounts', ...filteredConfigs.map(c => c.account_name)];
  
  const [availableRegions, setAvailableRegions] = useState(['All Regions']);
  const [availableTags, setAvailableTags] = useState(['All Tags']);

  const handleTopFilterChange = (key, value) => {
    if (key === 'provider') {
      const filtered = verifiedConfigs.filter(c => (c.provider || '').toUpperCase() === value);
      let newAccount = 'All Accounts';
      
      if (topFilters.account !== 'All Accounts') {
        const stillValid = filtered.find(c => c.account_name === topFilters.account);
        if (!stillValid && filtered.length > 0) {
          newAccount = filtered[0].account_name;
        } else if (!stillValid) {
          newAccount = 'All Accounts';
        } else {
          newAccount = topFilters.account;
        }
      }
      setTopFilters(prev => ({ ...prev, provider: value, account: newAccount }));
    } else {
      setTopFilters(prev => ({ ...prev, [key]: value }));
    }
  };

  useEffect(() => {
    loadConfigs();
    loadLogs();
  }, []);

  useEffect(() => {
    loadSummary();
    loadOptions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topFilters.account, topFilters.provider, topFilters.region, topFilters.tag]);

  const loadOptions = async () => {
    try {
      const options = await getFilterOptions({ account: topFilters.account, provider: topFilters.provider });
      if (options) {
        setAvailableRegions(['All Regions', ...(options.regions || [])]);
        setAvailableTags(['All Tags', ...(options.tags || [])]);
      }
    } catch (err) {
      console.error("Failed to load filter options", err);
    }
  };

  const loadLogs = async () => {
    // Action logging is handled internally by tabs, but if needed for global refresh, we could trigger an event.
    // We pass this as onActionLogged to ResourcesTab, so it can just trigger a refresh if needed.
    // Actually, since ActivityLogTab loads its own data on mount, we don't need global state.
  };

  const loadConfigs = async () => {
    try {
      const res = await listConfigs();
      const configs = res.data.configs || [];
      const vConfigs = configs.filter(c => c.verified);
      setVerifiedConfigs(vConfigs);
      
      if (vConfigs.length > 0) {
        const currentProvider = topFilters.provider;
        const validProvider = vConfigs.find(c => (c.provider || '').toUpperCase() === currentProvider);
        if (!validProvider) {
           setTopFilters(prev => ({ ...prev, provider: (vConfigs[0].provider || '').toUpperCase() }));
        }
      }
    } catch (err) {
      console.error("Failed to load configs", err);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    console.log(`[Sync Process] Starting sync for account: ${topFilters.account}`);
    try {
      const response = await syncResources(topFilters.account);
      console.log(`[Sync Process] Backend response:`, response);
      if (response && response.synced_count !== undefined) {
        toast.success(`Synced ${response.synced_count} resources for ${topFilters.account === 'All Accounts' ? 'all accounts' : topFilters.account}`);
      } else {
        toast.success(topFilters.account === 'All Accounts' ? "All accounts synced successfully" : `Account ${topFilters.account} synced successfully`);
      }
      await loadSummary();
    } catch (err) {
      console.error("[Sync Process] Error during sync:", err);
      toast.error("Failed to sync resources from AWS. Check browser console for details.");
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    setLoading(true);
    try {
      const summaryData = await getControlSummary(topFilters);
      if (summaryData) {
        setSummary(summaryData);
      }
    } catch (err) {
      toast.error('Failed to load summary from backend');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="sticky -top-6 h-6 -mx-6 -mt-6 bg-[#0a0a0f]/80 backdrop-blur-md z-30 pointer-events-none" />
      <div className="space-y-6 w-full max-w-6xl mx-auto p-0 relative">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3 text-white tracking-tight">Live Control & Power Automation</h1>
          <p className="text-sm text-zinc-500">Manage real-time execution & power scheduling for EC2 & RDS clusters</p>
        </div>
        <button onClick={handleSync} disabled={loading} className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      <FilterBar
        filters={[
          { label: "Provider:", value: topFilters.provider, onChange: v => handleTopFilterChange('provider', v), options: availableProviders.map(p => ({ label: p, value: p })), width: "max-w-[110px]" },
          { label: "Account:", value: topFilters.account, onChange: v => handleTopFilterChange('account', v), options: availableAccounts.map(a => ({ label: a, value: a })), width: "max-w-[150px]" },
          { label: "Region:", value: topFilters.region, onChange: v => handleTopFilterChange('region', v), options: availableRegions.map(r => ({ label: r, value: r })), width: "max-w-[120px]" },
          { label: "Tag:", value: topFilters.tag, onChange: v => handleTopFilterChange('tag', v), options: availableTags.map(t => ({ label: t, value: t })), width: "max-w-[150px]" },
          {
            label: "Range:",
            value: topFilters.range,
            onChange: v => handleTopFilterChange('range', v),
            options: [
              { label: 'Today', value: 1 },
              { label: 'Last 7 days', value: 7 },
              { label: 'Last 14 days', value: 14 },
              { label: 'Last 30 days', value: 30 }
            ],
            width: "w-auto"
          }
        ]}
      />

      {/* Main Global Tab Bar */}
      <div className="border-b border-zinc-800 flex gap-6">
        {['overview', 'activity', 'resources'].map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`pb-3 text-sm font-medium border-b-2 capitalize transition-colors ${activeTab === t ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="pt-2">
        {activeTab === 'overview' && (
          <OverviewTab
            runningCount={summary.running_count}
            stoppedCount={summary.stopped_count}
            activeSchedulesCount={summary.active_schedules_count}
          />
        )}
        {activeTab === 'activity' && <ActivityLogTab topFilters={topFilters} />}
        {activeTab === 'resources' && (
          <ResourcesTab
            topFilters={topFilters}
            onActionLogged={loadLogs}
          />
        )}
      </div>
    </div>
    </>
  );
}
