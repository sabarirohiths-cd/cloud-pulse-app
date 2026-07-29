import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, Power, Server, Database } from 'lucide-react';

export default function ActionModal({ isOpen, onClose, mode, resource, onConfirm }) {
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [schedulePattern, setSchedulePattern] = useState('daily');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [stopTime, setStopTime] = useState('21:00');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm({ mode, resource, automationEnabled, schedulePattern, ownerEmail, startTime, stopTime, timezone });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (resource?.schedule) {
      setAutomationEnabled(resource.schedule.is_automation_enabled ?? true);
      setSchedulePattern(resource.schedule.schedule_pattern || 'daily');
      setOwnerEmail(resource.schedule.owner_email || '');
      setStartTime(resource.schedule.start_time || '10:00');
      setStopTime(resource.schedule.stop_time || '21:00');
      setTimezone(resource.schedule.timezone || 'Asia/Kolkata');
    }
  }, [resource]);

  if (!isOpen || !resource) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#131315] border border-[#26262b] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-[#26262b] flex items-center justify-between bg-[#0e1015] shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {mode === 'schedule' ? <Clock className="h-5 w-5 text-blue-500"/> : <Power className="h-5 w-5 text-amber-400"/>}
              {mode === 'schedule' ? 'Schedule Automation' : 'Manual Power Action'}
            </h2>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">{resource.service_type || resource.resource_type} • {resource.region}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white hover:bg-[#1c2128] rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {mode === 'schedule' ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-white mb-4">Automation Settings</h3>
                <label className="flex items-center justify-between p-4 bg-[#161b22] border border-[#30363d] rounded-xl cursor-pointer hover:bg-[#1c2128] transition-colors mb-4">
                  <div>
                    <span className="text-sm font-semibold text-zinc-200 block">Enable Automated Schedule</span>
                    <span className="text-[10px] text-zinc-500">Allow CloudPulse to automatically turn this resource on and off</span>
                  </div>
                  <input type="checkbox" checked={automationEnabled} onChange={e => setAutomationEnabled(e.target.checked)} className="rounded accent-[#3b82f6] w-4 h-4"/>
                </label>

                {automationEnabled && (
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="bg-[#161b22] p-3.5 rounded-xl border border-[#30363d]">
                      <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-2 block">Schedule Pattern</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => setSchedulePattern('daily')}
                          className={`py-2 text-xs font-semibold rounded-md transition-colors border ${schedulePattern === 'daily' ? 'bg-[#3b82f6]/20 text-[#3b82f6] border-[#3b82f6]/50' : 'bg-[#0a0a0f] text-zinc-400 border-[#26262b] hover:bg-[#1c2128]'}`}
                        >
                          Daily
                        </button>
                        <button 
                          onClick={() => setSchedulePattern('mon_fri')}
                          className={`py-2 text-xs font-semibold rounded-md transition-colors border ${schedulePattern === 'mon_fri' ? 'bg-[#3b82f6]/20 text-[#3b82f6] border-[#3b82f6]/50' : 'bg-[#0a0a0f] text-zinc-400 border-[#26262b] hover:bg-[#1c2128]'}`}
                        >
                          Mon - Fri
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#161b22] p-3.5 rounded-xl border border-[#30363d]">
                        <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Power ON Time</label>
                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full text-xs font-mono bg-[#0a0a0f] border border-[#26262b] shadow-inner rounded px-2.5 py-1.5 text-[#d4d4d8] outline-none focus:border-[#3b82f6] transition-colors"/>
                      </div>
                      <div className="bg-[#161b22] p-3.5 rounded-xl border border-[#30363d]">
                        <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Power OFF Time</label>
                        <input type="time" value={stopTime} onChange={e => setStopTime(e.target.value)} className="w-full text-xs font-mono bg-[#0a0a0f] border border-[#26262b] shadow-inner rounded px-2.5 py-1.5 text-[#d4d4d8] outline-none focus:border-[#3b82f6] transition-colors"/>
                      </div>
                    </div>

                    <div className="bg-[#161b22] p-3.5 rounded-xl border border-[#30363d]">
                      <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Owner Email (Optional)</label>
                      <input 
                        type="email" 
                        placeholder="team@company.com" 
                        value={ownerEmail} 
                        onChange={e => setOwnerEmail(e.target.value)} 
                        className="w-full text-xs bg-[#0a0a0f] shadow-inner border border-[#26262b] rounded px-3 py-2 text-zinc-200 placeholder-zinc-600 outline-none focus:border-[#3b82f6] transition-colors"
                      />
                      <p className="text-[10px] text-zinc-500 mt-2">
                        Emails will be sent 1 hour before shutdown, allowing owners to extend or skip.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label className="text-[10px] uppercase text-zinc-500 font-semibold mb-1 block">Target Resource</label>
                <div className="bg-[#0a0a0f] p-3 rounded-xl border border-[#26262b] shadow-inner font-mono text-[11px] text-[#8b949e] break-all select-all flex items-center gap-2">
                  {resource.service_type === 'ec2' ? <Server className="h-4 w-4 text-zinc-500"/> : <Database className="h-4 w-4 text-zinc-500"/>}
                  {resource.resource_id}
                </div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                <p className="text-sm text-amber-200">
                  Are you sure you want to <strong>{mode === 'start' ? 'START' : 'STOP'}</strong> this resource immediately?
                </p>
                <p className="text-xs text-amber-500/70 mt-1">This action overrides any currently active schedules.</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 bg-[#0e1015] border-t border-[#26262b] flex justify-end gap-3 shrink-0">
          <button onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-xs font-medium text-zinc-300 bg-transparent border border-[#30363d] rounded-md hover:bg-[#1c2128] disabled:opacity-50 transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={isSubmitting} className="px-4 py-2 text-xs font-semibold bg-[#3b82f6] text-white rounded-md hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            {isSubmitting ? <span className="animate-pulse">Processing...</span> : 'Confirm Action'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
