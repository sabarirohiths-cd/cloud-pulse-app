import React from 'react';
import { createPortal } from 'react-dom';
import { Server, X, Globe, Tag as TagIcon, History } from 'lucide-react';
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
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Server className="h-5 w-5 text-blue-400" />
              {formatName(selectedResource.name, selectedResource.native_id, selectedResource.provider) || formatIdentifier(selectedResource.native_id, selectedResource.provider)}
            </h2>
            <p className="text-xs text-zinc-500 mt-1">{formatType(selectedResource.resource_type, selectedResource.provider)}</p>
          </div>
          <button onClick={() => setSelectedResource(null)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-6 px-5 border-b border-zinc-800 bg-zinc-900/30 shrink-0">
          <button 
            onClick={() => setActiveTab('overview')} 
            className={`py-3 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'overview' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            Overview
          </button>
          <button 
            onClick={() => setActiveTab('json')} 
            className={`py-3 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'json' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            Raw JSON
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {activeTab === 'overview' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-800/30 p-3 rounded-lg border border-zinc-800">
                  <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Region</label>
                  <p className="text-sm font-medium text-zinc-200 flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-zinc-400" /> {selectedResource.region}</p>
                </div>
                <div className="bg-zinc-800/30 p-3 rounded-lg border border-zinc-800">
                  <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Billable Status</label>
                  <p className="text-sm font-medium text-zinc-200">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${selectedResource.billable ? 'bg-blue-400' : 'bg-zinc-500'}`} />
                    {selectedResource.billable ? 'Billable' : 'Non-Billable'}
                  </p>
                </div>
                <div className="bg-zinc-800/30 p-3 rounded-lg border border-zinc-800">
                  <p className="text-xs text-zinc-500 font-medium mb-1 block">First Seen</p>
                  <p className="text-sm font-medium text-zinc-200">
                    {(() => {
                      if (!selectedResource.first_seen_date) return 'Unknown';
                      let dString = selectedResource.first_seen_date;
                      if (!dString.includes('T')) dString = dString.replace(' ', 'T');
                      if (!dString.includes('+') && !dString.includes('Z')) dString += '+05:30';
                      const d = new Date(dString);
                      if (isNaN(d.getTime())) return selectedResource.first_seen_date;
                      return `${d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} ${d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })}`;
                    })()}
                  </p>
                </div>
                <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50">
                  <p className="text-xs text-zinc-500 font-medium mb-1 flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Deleted At</p>
                  <p className="text-sm font-medium text-zinc-200">
                    {(() => {
                      if (!selectedResource.deleted_at) return 'N/A';
                      let dString = selectedResource.deleted_at;
                      if (!dString.includes('T')) dString = dString.replace(' ', 'T');
                      if (!dString.includes('+') && !dString.includes('Z')) dString += '+05:30';
                      const d = new Date(dString);
                      if (isNaN(d.getTime())) return selectedResource.deleted_at;
                      return `${d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} ${d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })}`;
                    })()}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Raw Identifier (ARN)</label>
                <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 font-mono text-[10px] text-zinc-400 break-all select-all">
                  {selectedResource.native_id}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <TagIcon className="h-4 w-4 text-zinc-400" />
                  <h3 className="text-sm font-semibold text-zinc-200">{(selectedResource.provider || 'cloud').toUpperCase()} Tags</h3>
                </div>
                {(() => {
                  try {
                    const tags = typeof selectedResource.tags === 'string' ? JSON.parse(selectedResource.tags) : (selectedResource.tags || {});
                    const tagKeys = Object.keys(tags);
                    if (tagKeys.length === 0) return <EmptyState icon={TagIcon} message="No tags found on this resource." height="h-[100px]" />;
                    return (
                      <div className="grid grid-cols-2 gap-2">
                        {tagKeys.map(k => (
                          <div key={k} className="bg-zinc-800/40 border border-zinc-700/50 rounded flex overflow-hidden">
                            <div className="px-2 py-1.5 bg-zinc-800 border-r border-zinc-700/50 text-[10px] font-semibold text-zinc-400 w-1/3 truncate" title={k}>
                              {k}
                            </div>
                            <div className="px-2 py-1.5 text-[10px] text-zinc-200 truncate font-mono w-2/3" title={tags[k]}>
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
            <div className="border border-zinc-800 rounded-lg overflow-hidden h-full">
              <div className="bg-[#0a0a0a] p-4 m-0 overflow-y-auto overflow-x-hidden h-full min-h-[300px] max-h-[60vh] text-[11px] font-mono table w-full">
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
