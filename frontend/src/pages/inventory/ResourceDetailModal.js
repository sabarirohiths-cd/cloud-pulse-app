import React from 'react';
import { createPortal } from 'react-dom';
import { Server, X, Globe, Tag as TagIcon, History } from 'lucide-react';
import { formatDynamicLocalTime } from '../../utils/dateFormatter';
import { formatType, formatIdentifier, formatName } from '../../utils/ui-utils';
import { EmptyState } from '../../components/ui/EmptyState';

const colorizeJson = (jsonObj) => {
  if (!jsonObj) return '';
  
  // Clone to avoid mutating the original state
  const cleanObj = { ...jsonObj };
  // Automatically parse stringified tags so they format as a proper nested JSON tree
  if (typeof cleanObj.tags === 'string') {
    try { cleanObj.tags = JSON.parse(cleanObj.tags); } catch(e) {}
  }

  const jsonStr = JSON.stringify(cleanObj, null, 2);
  
  return jsonStr.split('\n').map((line, i) => {
    // Basic regex for JSON syntax highlighting
    let coloredLine = line;
    // Keys (strings before colon)
    coloredLine = coloredLine.replace(/"([^"]+)":/g, '<span class="text-sky-300">"$1"</span>:');
    // String values
    coloredLine = coloredLine.replace(/: "([^"]*)"/g, ': <span class="text-zinc-100">"$1"</span>');
    // Numbers
    coloredLine = coloredLine.replace(/: (-?\d+\.?\d*)/g, ': <span class="text-emerald-300">$1</span>');
    // Booleans
    coloredLine = coloredLine.replace(/: (true|false|null)/g, ': <span class="text-purple-400 font-medium">$1</span>');

    return (
      <div key={i} className="table-row">
        <span className="table-cell text-zinc-600 select-none pr-4 text-right border-r border-zinc-800">{i + 1}</span>
        <span className="table-cell pl-4 break-words whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: coloredLine }} />
      </div>
    );
  });
};

export function ResourceDetailModal({ selectedResource, setSelectedResource }) {
  const [activeTab, setActiveTab] = React.useState('overview');

  React.useEffect(() => {
    if (selectedResource) setActiveTab('overview');
  }, [selectedResource]);

  if (!selectedResource) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center w-screen h-screen bg-black/60 backdrop-blur-sm">
      <div className="bg-[#131315] border border-[#26262b] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-[#26262b] flex items-center justify-between bg-[#0e1015] shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Server className="h-5 w-5 text-blue-500" />
              {formatName(selectedResource.name, selectedResource.native_id, selectedResource.provider) || formatIdentifier(selectedResource.native_id, selectedResource.provider)}
            </h2>
            <p className="text-xs text-[#8b949e] mt-1">{formatType(selectedResource.resource_type, selectedResource.provider)}</p>
          </div>
          <button onClick={() => setSelectedResource(null)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-[#1c2128] rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-6 px-5 border-b border-[#26262b] bg-[#131315] shrink-0">
          <button 
            onClick={() => setActiveTab('overview')} 
            className={`py-3 text-[13px] font-semibold border-b-2 transition-colors ${activeTab === 'overview' ? 'border-[#3b82f6] text-[#3b82f6]' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            Overview
          </button>
          <button 
            onClick={() => setActiveTab('json')} 
            className={`py-3 text-[13px] font-semibold border-b-2 transition-colors ${activeTab === 'json' ? 'border-[#3b82f6] text-[#3b82f6]' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            Raw JSON
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {activeTab === 'overview' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#161b22] p-3.5 rounded-xl border border-[#30363d]">
                  <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Region</label>
                  <p className="text-sm font-medium text-zinc-200 flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-zinc-400" /> {selectedResource.region}</p>
                </div>
                <div className="bg-[#161b22] p-3.5 rounded-xl border border-[#30363d]">
                  <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Billable Status</label>
                  <p className="text-sm font-medium text-zinc-200">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${selectedResource.billable ? 'bg-[#3b82f6]' : 'bg-zinc-500'}`} />
                    {selectedResource.billable ? 'Billable' : 'Non-Billable'}
                  </p>
                </div>
                <div className="bg-[#161b22] p-3.5 rounded-xl border border-[#30363d]">
                  <p className="text-xs text-zinc-500 font-medium mb-1 block">First Seen</p>
                  <p className="text-sm font-medium text-white">
                    {formatDynamicLocalTime(selectedResource.first_seen_date)}
                  </p>
                </div>
                <div className="bg-[#161b22] p-3.5 rounded-xl border border-[#30363d]">
                  <p className="text-xs text-zinc-500 font-medium mb-1 flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Deleted At</p>
                  <p className="text-sm font-medium text-red-400">
                    {formatDynamicLocalTime(selectedResource.deleted_at)}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Raw Identifier (ARN)</label>
                <div className="bg-[#0a0a0f] p-3 rounded-xl border border-[#26262b] font-mono text-[11px] text-[#8b949e] break-all select-all shadow-inner">
                  {selectedResource.native_id}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <TagIcon className="h-4 w-4 text-zinc-400" />
                  <h3 className="text-sm font-semibold text-zinc-200">{(selectedResource.provider || 'cloud').toUpperCase()} Tags</h3>
                </div>
                {(() => {
                  try {
                    const tags = typeof selectedResource.tags === 'string' ? JSON.parse(selectedResource.tags) : (selectedResource.tags || {});
                    const tagKeys = Object.keys(tags);
                    if (tagKeys.length === 0) return <EmptyState icon={TagIcon} message="No tags found on this resource." height="h-[100px]" />;
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        {tagKeys.map(k => (
                          <div key={k} className="bg-[#161b22] border border-[#30363d] rounded-lg flex overflow-hidden shadow-sm">
                            <div className="px-2.5 py-2 bg-[#1c2128] border-r border-[#30363d] text-[11px] font-semibold text-[#8b949e] w-[40%] truncate" title={k}>
                              {k}
                            </div>
                            <div className="px-2.5 py-2 text-[11px] text-zinc-300 truncate font-mono w-[60%]" title={tags[k]}>
                              {tags[k]}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch (e) {
                    return <div className="text-xs text-zinc-500">Could not parse tags.</div>;
                  }
                })()}
              </div>
            </div>
          ) : (
            <div className="border border-[#26262b] rounded-xl overflow-hidden h-full shadow-inner">
              <div className="bg-[#0a0a0f] p-4 m-0 overflow-y-auto overflow-x-hidden h-full min-h-[300px] max-h-[60vh] text-[11px] font-mono table w-full">
                {colorizeJson(selectedResource)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
