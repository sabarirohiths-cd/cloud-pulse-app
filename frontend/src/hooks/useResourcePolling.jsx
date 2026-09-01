import { useEffect } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL } from '../api/api';

export function useResourcePolling(resources, setResources) {
  useEffect(() => {
    // Connect to Server-Sent Events stream
    const eventSource = new EventSource(`${API_BASE_URL}/control/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.topic === 'resource_update') {
          const { resource_id, status } = data.data;
          
          setResources(prev => {
            const resource = prev.find(r => r.resource_id === resource_id);
            if (!resource) return prev; // Ignore updates for resources not loaded in this view
            
            const oldState = resource.status.toUpperCase();
            const newState = status.toUpperCase();
            
            if (oldState === newState) return prev;
            
            // Notify user of definitive state completion
            if (oldState !== 'RUNNING' && (newState === 'RUNNING' || newState === 'AVAILABLE')) {
              toast.success(`Resource ${resource.name || resource.resource_id} is completely ON!`);
              window.dispatchEvent(new Event('app:refresh-data'));
            } else if (oldState !== 'STOPPED' && (newState === 'STOPPED' || newState === 'PAUSED')) {
              toast.success(`Resource ${resource.name || resource.resource_id} is completely OFF!`);
              window.dispatchEvent(new Event('app:refresh-data'));
            }

            // Dynamically patch the specific resource in the table
            return prev.map(res => 
              res.resource_id === resource_id ? { ...res, status: newState } : res
            );
          });
        }
      } catch (err) {
        console.error('Failed to parse SSE message', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
    };

    return () => {
      eventSource.close();
    };
  }, [setResources]);
}
