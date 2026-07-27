import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, Power, Server, Database } from 'lucide-react';

export default function ActionModal({ isOpen, onClose, mode, resource, onConfirm }) {
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [startTime, setStartTime] = useState('10:00');
  const [stopTime, setStopTime] = useState('21:00');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm({ mode, resource, automationEnabled, startTime, stopTime, timezone });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (resource?.schedule) {
      setAutomationEnabled(resource.schedule.is_automation_enabled ?? true);
      setStartTime(resource.schedule.start_time || '10:00');
      setStopTime(resource.schedule.stop_time || '21:00');
      setTimezone(resource.schedule.timezone || 'Asia/Kolkata');
    }
  }, [resource]);

  if (!isOpen || !resource) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center w-screen h-screen bg-black/60 backdrop-blur-sm">
      <div className={`bg-zinc-900 border border-zinc-800 rounded-2xl w-full ${mode === 'schedule' ? 'max-w-3xl' : 'max-w-lg'} shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]`}>
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {mode === 'schedule' ? <Clock className="h-5 w-5 text-blue-400"/> : <Power className="h-5 w-5 text-amber-400"/>}
              {mode === 'schedule' ? 'Schedule Automation' : 'Manual Power Action'}
            </h2>
            <p className="text-xs text-zinc-500 mt-1 uppercase tracking-wider">{resource.service_type || resource.resource_type} • {resource.region}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {mode === 'schedule' ? (
            <div className="grid grid-cols-2 gap-8">
              {/* Left Side: Schedule Form */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-white mb-4">Automation Settings</h3>
                  <label className="flex items-center justify-between p-4 bg-zinc-800/30 border border-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-800/50 transition-colors mb-4">
                    <div>
                      <span className="text-sm font-semibold text-zinc-200 block">Enable Automated Schedule</span>
                      <span className="text-[10px] text-zinc-500">Allow CloudPulse to automatically turn this resource on and off</span>
                    </div>
                    <input type="checkbox" checked={automationEnabled} onChange={e => setAutomationEnabled(e.target.checked)} className="rounded accent-blue-600 w-4 h-4"/>
                  </label>

                  {automationEnabled && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-zinc-800/30 p-3 rounded-lg border border-zinc-800">
                        <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Power ON Time</label>
                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-white outline-none focus:border-blue-500 transition-colors"/>
                      </div>
                      <div className="bg-zinc-800/30 p-3 rounded-lg border border-zinc-800">
                        <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Power OFF Time</label>
                        <input type="time" value={stopTime} onChange={e => setStopTime(e.target.value)} className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-white outline-none focus:border-blue-500 transition-colors"/>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: View More Details */}
              <div className="border-l border-zinc-800 pl-8 space-y-5">
                <h3 className="text-sm font-semibold text-white mb-2">Resource Details</h3>
                
                <div>
                  <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Target Resource ID</label>
                  <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 font-mono text-[11px] text-zinc-300 break-all select-all flex items-center gap-2">
                    {resource.service_type === 'ec2' ? <Server className="h-4 w-4 text-zinc-500"/> : <Database className="h-4 w-4 text-zinc-500"/>}
                    {resource.resource_id}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Cloud Provider</label>
                    <div className="text-xs text-zinc-200 capitalize font-medium">{resource.cloud_provider}</div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Account</label>
                    <div className="text-xs text-zinc-200 font-medium">{resource.account_name}</div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Region</label>
                    <div className="text-xs text-zinc-200 font-medium">{resource.region}</div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Spec / Size</label>
                    <div className="text-xs text-zinc-200 font-medium">{resource.instance_spec}</div>
                  </div>
                </div>

                {resource.tags && Object.keys(resource.tags).length > 0 && (
                  <div>
                    <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-2 block">AWS Tags</label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(resource.tags).map(([key, value]) => (
                        <span key={key} className="inline-flex items-center px-2 py-1 rounded text-[10px] font-medium bg-zinc-800/50 text-zinc-300 border border-zinc-700/50">
                          <span className="text-zinc-500 mr-1">{key}:</span> {value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Target Resource</label>
                <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 font-mono text-[11px] text-zinc-300 break-all select-all flex items-center gap-2">
                  {resource.service_type === 'ec2' ? <Server className="h-4 w-4 text-zinc-500"/> : <Database className="h-4 w-4 text-zinc-500"/>}
                  {resource.resource_id}
                </div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                <p className="text-sm text-amber-200">
                  Are you sure you want to <strong>{mode === 'start' ? 'START' : 'STOP'}</strong> this resource immediately?
                </p>
                <p className="text-xs text-amber-500/70 mt-1">This action overrides any currently active schedules.</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 bg-zinc-900/50 border-t border-zinc-800 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-xs font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={isSubmitting} className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-900/20 flex items-center gap-2">
            {isSubmitting ? <span className="animate-pulse">Processing...</span> : 'Confirm Action'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
