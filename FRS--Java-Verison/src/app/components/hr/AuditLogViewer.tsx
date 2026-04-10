import React, { useState, useEffect } from 'react';
import { Search, Download, ChevronDown, ChevronRight, Calendar, Filter } from 'lucide-react';
import { cn } from '../ui/utils';
import { authConfig } from '../../config/authConfig';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';

interface AuditEvent {
  id: string;
  action: string;
  details: string;
  beforeData?: any;
  afterData?: any;
  userName: string;
  userRole?: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  ipAddress?: string;
  source?: string;
  createdAt: string;
}

export const AuditLogViewer: React.FC = () => {
  const { accessToken } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);
  const limit = 50;
  
  useEffect(() => {
    loadAuditLog();
  }, [page, categoryFilter]);
  
  const loadAuditLog = async () => {
    if (!accessToken) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String((page - 1) * limit),
        category: categoryFilter,
        ...(searchTerm && { q: searchTerm })
      });
      
      const response = await fetch(`${authConfig.apiBaseUrl}/live/audit?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events || []);
        setTotalEvents(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load audit log:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSearch = () => {
    setPage(1);
    loadAuditLog();
  };
  
  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };
  
  const exportToCsv = () => {
    const headers = ['Timestamp', 'Action', 'Details', 'User', 'Role', 'Entity Type', 'Entity Name', 'IP Address'];
    const rows = events.map(e => [
      new Date(e.createdAt).toLocaleString(),
      e.action,
      e.details,
      e.userName,
      e.userRole || '',
      e.entityType || '',
      e.entityName || '',
      e.ipAddress || ''
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };
  
  const totalPages = Math.ceil(totalEvents / limit);
  
  return (
    <div className="space-y-4 p-6 bg-white dark:bg-slate-900 rounded-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Audit Log</h2>
        <Button onClick={exportToCsv} variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>
      
      {/* Filters */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by employee, user, or action..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>
        
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
        >
          <option value="all">All Events</option>
          <option value="face">Face Enrollment</option>
          <option value="employee">Employee</option>
          <option value="attendance">Attendance</option>
          <option value="auth">Authentication</option>
        </select>
        
        <Button onClick={handleSearch} size="sm">
          <Filter className="w-4 h-4 mr-2" />
          Apply
        </Button>
      </div>
      
      {/* Events Table */}
      {loading ? (
        <div className="text-center py-8 text-slate-500">Loading...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-8 text-slate-500">No audit events found</div>
      ) : (
        <>
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">Timestamp</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">Details</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">User</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {events.map((event) => (
                  <React.Fragment key={event.id}>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer" onClick={() => toggleRow(event.id)}>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {new Date(event.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                          {event.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-200">
                        {event.details}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {event.userName}
                        {event.userRole && (
                          <span className="ml-2 text-xs text-slate-500">({event.userRole})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(event.beforeData || event.afterData) && (
                          expandedRows.has(event.id) ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )
                        )}
                      </td>
                    </tr>
                    
                    {/* Expanded row showing before/after data */}
                    {expandedRows.has(event.id) && (event.beforeData || event.afterData) && (
                      <tr>
                        <td colSpan={5} className="px-4 py-3 bg-slate-50 dark:bg-slate-800">
                          <div className="grid grid-cols-2 gap-4">
                            {event.beforeData && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Before:</p>
                                <pre className="text-xs bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700 overflow-auto">
                                  {JSON.stringify(event.beforeData, null, 2)}
                                </pre>
                              </div>
                            )}
                            {event.afterData && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">After:</p>
                                <pre className="text-xs bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700 overflow-auto">
                                  {JSON.stringify(event.afterData, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Showing {((page - 1) * limit) + 1} - {Math.min(page * limit, totalEvents)} of {totalEvents} events
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
