import { apiClient } from './api';

export const listSchedules = async () => {
  const response = await apiClient.get('/control/schedules');
  return response.data;
};

export const syncResources = async (accountName) => {
  const params = accountName && accountName !== 'All Accounts' ? { account_name: accountName } : {};
  const response = await apiClient.post('/control/sync', null, { params });
  return response.data;
};

export const listResources = async (filters = {}, limit = 50, offset = 0) => {
  const params = { limit, offset };
  if (filters.account && filters.account !== 'All Accounts') params.account_name = filters.account;
  if (filters.provider && filters.provider !== 'All Providers') params.provider = filters.provider;
  if (filters.region && filters.region !== 'All Regions') params.region = filters.region;
  if (filters.tag && filters.tag !== 'All Tags') params.tag = filters.tag;
  
  const response = await apiClient.get('/control/resources', { params });
  return response.data;
};

export const getControlSummary = async (filters = {}) => {
  const params = {};
  if (filters.account && filters.account !== 'All Accounts') params.account_name = filters.account;
  if (filters.provider && filters.provider !== 'All Providers') params.provider = filters.provider;
  if (filters.region && filters.region !== 'All Regions') params.region = filters.region;
  if (filters.tag && filters.tag !== 'All Tags') params.tag = filters.tag;
  
  const response = await apiClient.get('/control/summary', { params });
  return response.data;
};

export const saveSchedule = async (payload) => {
  const response = await apiClient.post('/control/schedule', payload);
  return response.data;
};

export const getFilterOptions = async (filters = {}) => {
  const params = {};
  if (filters.account && filters.account !== 'All Accounts') params.account_name = filters.account;
  if (filters.provider && filters.provider !== 'All Providers') params.provider = filters.provider;
  
  const response = await apiClient.get('/control/filter-options', { params });
  return response.data;
};

export const togglePower = async (payload) => {
  const response = await apiClient.post('/control/toggle-power', payload);
  return response.data;
};

export const logAction = async (payload) => {
  const response = await apiClient.post('/control/log-action', payload);
  return response.data;
};

export const listAuditLogs = async (limit = 50) => {
  const response = await apiClient.get('/control/audit-logs', { params: { limit } });
  return response.data;
};

export const getLiveState = async ({ provider, region, serviceType, resourceId, accountName }) => {
  const response = await apiClient.get(`/control/state/${provider}/${region}/${serviceType}/${resourceId}`, {
    params: { account_name: accountName }
  });
  return response.data;
};

