import React, { useState, useEffect } from 'react';
import { RefreshCw, Link, Shield, Users, Loader2, CheckCircle, Database } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { apiRequest } from '../../services/http/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

interface EnrollmentPending {
  pk_employee_id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
  photos_count: number;
  enrollment_complete: boolean;
}

export const HRMSManagement: React.FC = () => {
  const { accessToken } = useAuth();
  const [enrollmentQueue, setEnrollmentQueue] = useState<EnrollmentPending[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [webhookUrl] = useState(`http://172.20.100.222:8080/api/hrms/webhook/employee`);
  const [apiKey] = useState('CHANGE_THIS_WEBHOOK_KEY_2026'); // This should come from settings

  const fetchEnrollmentQueue = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; employees: EnrollmentPending[] }>(
        '/hrms/enrollment-queue',
        { accessToken }
      );
      if (res.success) {
        setEnrollmentQueue(res.employees);
      }
    } catch (error) {
      toast.error('Failed to load enrollment queue');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEnrollmentQueue();
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Webhook Configuration */}
        <Card className="border-slate-200/60 dark:border-slate-800/60 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Link className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-lg">HRMS Webhook</CardTitle>
                <CardDescription>Receiver for real-time employee events</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Webhook URL</label>
              <div className="flex gap-2">
                <code className="flex-1 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-mono break-all border border-slate-200 dark:border-slate-700">
                  {webhookUrl}
                </code>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl)}>Copy</Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">X-API-KEY</label>
              <div className="flex gap-2">
                <code className="flex-1 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-700">
                  ••••••••••••••••
                </code>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(apiKey)}>Copy</Button>
              </div>
            </div>
            <div className="pt-4 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-100 dark:border-amber-900/20">
              <Shield className="w-4 h-4" />
              <span>Use these credentials to configure real-time sync from your HR platform.</span>
            </div>
          </CardContent>
        </Card>

        {/* Sync Summary */}
        <Card className="border-slate-200/60 dark:border-slate-800/60 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <RefreshCw className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-lg">Synchronized Data</CardTitle>
                <CardDescription>Active HRMS connection status</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 flex flex-col items-center justify-center py-10 text-center">
            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mb-4">
              <Database className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h4 className="text-xl font-black text-slate-800 dark:text-white">Active Connection</h4>
            <p className="text-sm text-slate-500 mt-2 max-w-[250px]">
              Ready to receive bulk imports and programmatic synchronization.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Enrollment Queue */}
      <Card className="border-slate-200/60 dark:border-slate-800/60 shadow-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                <Users className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-lg">Enrollment Queue</CardTitle>
                <CardDescription>Employees synced but pending face enrollment</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchEnrollmentQueue} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && enrollmentQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
              <p className="text-sm font-medium">Scanning roster...</p>
            </div>
          ) : enrollmentQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <CheckCircle className="w-12 h-12 mb-4 text-emerald-500/50" />
              <p className="text-sm font-black uppercase tracking-widest">Queue Clear</p>
              <p className="text-xs mt-1">All synchronized employees have enrolled faces.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest whitespace-nowrap leading-none">Employee</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest whitespace-nowrap leading-none">Department</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest whitespace-nowrap leading-none">Photos</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest whitespace-nowrap leading-none">Status</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest whitespace-nowrap leading-none">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {enrollmentQueue.map((emp) => (
                    <tr key={emp.pk_employee_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 dark:text-white leading-tight">{emp.first_name} {emp.last_name}</span>
                          <span className="text-[10px] font-mono text-slate-400 uppercase mt-0.5">{emp.employee_code}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">{emp.department || '—'}</td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full" 
                              style={{ width: `${(emp.photos_count / 5) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-blue-500">{emp.photos_count}/5</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="text-[10px] font-black tracking-widest border-blue-200 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800">
                          PENDING ENROLLMENT
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Button variant="outline" size="sm" className="h-8 text-xs font-bold border-slate-200 dark:border-slate-700">
                          Invite
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
