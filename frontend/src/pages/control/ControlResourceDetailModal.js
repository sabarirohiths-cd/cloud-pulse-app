import React from 'react';
import { createPortal } from 'react-dom';
import { Server, Database, X, Globe, Tag as TagIcon, LayoutTemplate } from 'lucide-react';
import { formatIdentifier, formatName } from '../../utils/ui-utils';
import { EmptyState } from '../../components/ui/EmptyState';

export function ControlResourceDetailModal({ resource, onClose }) {
  if (!resource) return null;

  let tags = {};
  try {
    if (resource.tags_json) tags = typeof resource.tags_json === 'string' ? JSON.parse(resource.tags_json) : resource.tags_json;
  } catch (e) {}

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center w-screen h-screen bg-black/60 backdrop-blur-sm">
      <div className="bg-[#131315] border border-[#26262b] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-[#26262b] flex items-center justify-between bg-[#0e1015] shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {resource.service_type?.toLowerCase() === 'ec2' ? <Server className="h-5 w-5 text-blue-500" /> : <Database className="h-5 w-5 text-blue-500" />}
              {formatName(resource.name, resource.resource_id, resource.cloud_provider) || formatIdentifier(resource.resource_id, resource.cloud_provider)}
            </h2>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">{resource.service_type} • {resource.region}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white hover:bg-[#1c2128] rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#161b22] p-3.5 rounded-xl border border-[#30363d]">
              <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Provider</label>
              <p className="text-sm font-medium text-zinc-200 capitalize flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-zinc-400" /> {resource.cloud_provider}
              </p>
            </div>
            <div className="bg-[#161b22] p-3.5 rounded-xl border border-[#30363d]">
              <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Account</label>
              <p className="text-sm font-medium text-zinc-200">{resource.account_name}</p>
            </div>
            <div className="bg-[#161b22] p-3.5 rounded-xl border border-[#30363d]">
              <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Status</label>
              <p className="text-sm font-medium text-zinc-200">{resource.status}</p>
            </div>
            <div className="bg-[#161b22] p-3.5 rounded-xl border border-[#30363d]">
              <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Control Type</label>
              <p className="text-sm font-medium text-zinc-200 capitalize">{resource.control_type?.replace(/_/g, ' ').toLowerCase()}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Resource ID</label>
              <div className="bg-[#0a0a0f] p-3 rounded-xl border border-[#26262b] shadow-inner font-mono text-[11px] text-[#8b949e] break-all select-all flex items-center gap-2">
                {resource.resource_id}
              </div>
            </div>

            {resource.instance_spec && (
              <div>
                <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Instance Spec</label>
                <div className="bg-[#0a0a0f] p-3 rounded-xl border border-[#26262b] shadow-inner font-mono text-[11px] text-[#8b949e] break-all flex items-center gap-2">
                  <LayoutTemplate className="h-4 w-4 text-zinc-500"/>
                  {resource.instance_spec}
                </div>
              </div>
            )}

            {resource.parent_resource_id && (
              <div>
                <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Master Instance</label>
                <div className="bg-blue-900/10 p-3 rounded-xl border border-blue-900/30 font-mono text-[11px] text-blue-400 break-all flex items-center gap-2">
                  <Server className="h-4 w-4 text-blue-400"/>
                  {resource.parent_resource_id}
                </div>
              </div>
            )}

            <div>
              <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-2 flex items-center gap-1.5"><TagIcon className="h-3.5 w-3.5" /> Tags</label>
              {Object.keys(tags).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(tags).map(([key, value]) => (
                    <div key={key} className="px-2.5 py-1.5 rounded-lg bg-[#1c2128] border border-[#30363d] text-xs flex gap-1.5 max-w-full shadow-sm">
                      <span className="text-[#8b949e] font-semibold truncate shrink-0 max-w-[150px]">{key}</span>
                      <span className="text-zinc-300 truncate max-w-[200px]" title={value}>{value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={TagIcon} message="No tags found" height="h-[80px]" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
