import React, { useState, useRef, useCallback } from 'react';
import { Upload, Download, X, CheckCircle, AlertTriangle, SkipForward, FileSpreadsheet, Users } from 'lucide-react';
import { cn } from '../ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { toast } from 'sonner';

interface BulkRow {
  employee_code: string;
  full_name: string;
  email?: string;
  position_title?: string;
  department_name?: string;
  shift_name?: string;
  location_label?: string;
  join_date?: string;
  status?: string;
}

interface ImportResult {
  row: BulkRow;
  status: 'created' | 'skipped' | 'error';
  message: string;
}

interface BulkImportProps {
  onClose: () => void;
  onSuccess: () => void;
}

const TEMPLATE_HEADERS = [
  'employee_code','full_name','email','position_title',
  'department_name','shift_name','location_label','join_date','status'
];

const SAMPLE_ROWS = [
  ['EMP001','John Smith','john@company.com','Software Engineer','Engineering','Morning Shift','Floor 1','2026-01-15','active'],
  ['EMP002','Jane Doe','jane@company.com','HR Manager','Human Resources','General Shift','Floor 2','2026-02-01','active'],
  ['EMP003','Bob Wilson','bob@company.com','Sales Executive','Sales','Evening Shift','Floor 3','2026-03-01','active'],
];

function parseCSV(text: string): BulkRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj: any = {};
    headers.forEach((h, i) => { if (vals[i]) obj[h] = vals[i]; });
    return obj as BulkRow;
  });
}

export const BulkImportModal: React.FC<BulkImportProps> = ({ onClose, onSuccess }) => {
  const { accessToken } = useAuth();
  const scopeHeaders = { 'x-tenant-id': '1', 'x-customer-id': '1', 'x-site-id': '1' };
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows]         = useState<BulkRow[]>([]);
  const [results, setResults]   = useState<ImportResult[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [filename, setFilename] = useState('');

  const downloadTemplate = () => {
    const csv = [TEMPLATE_HEADERS.join(','), ...SAMPLE_ROWS.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'employee_import_template.csv'; a.click();
  };

  const processFile = (file: File) => {
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      const parsed = parseCSV(e.target?.result as string);
      setRows(parsed);
      setResults(null);
    };
    reader.readAsText(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) processFile(file);
    else toast.error('Please upload a CSV file');
  }, []);

  const handleImport = async () => {
    if (!rows.length || !accessToken) return;
    setImporting(true);
    try {
      const data = await apiRequest('/employees/bulk-import', {
        accessToken, scopeHeaders,
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      setResults(data.results ?? []);
      if (data.created > 0) {
        toast.success(`Imported ${data.created} employee${data.created > 1 ? 's' : ''}`);
        if (data.skipped > 0) toast.warning(`${data.skipped} skipped (duplicates)`);
        if (data.errors > 0)  toast.error(`${data.errors} failed`);
        onSuccess();
      } else {
        toast.warning('No new employees were created');
      }
    } catch (e: any) {
      toast.error('Import failed: ' + (e.message ?? 'Unknown error'));
    } finally {
      setImporting(false);
    }
  };

  const statusIcon = (s: string) => {
    if (s === 'created') return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    if (s === 'skipped') return <SkipForward className="w-4 h-4 text-amber-500" />;
    return <AlertTriangle className="w-4 h-4 text-rose-500" />;
  };

  const statusCls = (s: string) => {
    if (s === 'created') return 'bg-emerald-500/10 text-emerald-600';
    if (s === 'skipped') return 'bg-amber-500/10 text-amber-600';
    return 'bg-rose-500/10 text-rose-600';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg"><FileSpreadsheet className="w-5 h-5 text-primary" /></div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Bulk Employee Import</h2>
              <p className="text-xs text-muted-foreground">Import multiple employees from a CSV file</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Step 1 — Download template */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Step 1 — Download Template</p>
              <p className="text-xs text-muted-foreground mt-0.5">Fill in employee details and save as CSV</p>
            </div>
            <button onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors">
              <Download className="w-4 h-4" /> Template
            </button>
          </div>

          {/* Step 2 — Upload */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Step 2 — Upload CSV</p>
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              )}>
              <input ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
              <Upload className={cn('w-8 h-8 mx-auto mb-3', dragOver ? 'text-primary' : 'text-muted-foreground')} />
              {filename ? (
                <div>
                  <p className="text-sm font-semibold text-foreground">{filename}</p>
                  <p className="text-xs text-emerald-500 mt-1">{rows.length} rows parsed</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-foreground">Drop CSV here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports .csv files only</p>
                </div>
              )}
            </div>
          </div>

          {/* Preview table */}
          {rows.length > 0 && !results && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">
                  Preview <span className="text-muted-foreground text-xs ml-1">({rows.length} rows)</span>
                </p>
                <button onClick={() => { setRows([]); setFilename(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
              </div>
              <div className="border border-border rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>{['Code','Name','Email','Position','Department','Shift','Status'].map(h => (
                      <th key={h} className="px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-accent/30 transition-colors">
                        <td className="px-3 py-2 font-mono text-primary">{r.employee_code || <span className="text-rose-500">missing</span>}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{r.full_name || <span className="text-rose-500">missing</span>}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.email || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.position_title || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.department_name || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.shift_name || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                            r.status === 'inactive' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500')}>
                            {r.status || 'active'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Results */}
          {results && (
            <div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  ['Created', results.filter(r=>r.status==='created').length, 'text-emerald-500 bg-emerald-500/10'],
                  ['Skipped', results.filter(r=>r.status==='skipped').length, 'text-amber-500 bg-amber-500/10'],
                  ['Failed',  results.filter(r=>r.status==='error').length,   'text-rose-500 bg-rose-500/10'],
                ].map(([l,v,cls]) => (
                  <div key={l as string} className={cn('rounded-xl p-4 text-center', (cls as string).split(' ')[1])}>
                    <p className={cn('text-2xl font-bold', (cls as string).split(' ')[0])}>{v as number}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{l}</p>
                  </div>
                ))}
              </div>
              <div className="border border-border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">Status</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">Code</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">Name</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {results.map((r, i) => (
                      <tr key={i} className="hover:bg-accent/30">
                        <td className="px-3 py-2">
                          <span className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit', statusCls(r.status))}>
                            {statusIcon(r.status)} {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{r.row.employee_code}</td>
                        <td className="px-3 py-2 text-foreground">{r.row.full_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-between items-center bg-muted/20">
          <p className="text-xs text-muted-foreground">
            {results
              ? `Import complete — ${results.filter(r=>r.status==='created').length} employees added`
              : rows.length > 0 ? `${rows.length} rows ready to import` : 'No file selected'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
              {results ? 'Close' : 'Cancel'}
            </button>
            {!results && (
              <button onClick={handleImport} disabled={rows.length === 0 || importing}
                className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold rounded-lg transition-all disabled:opacity-50 flex items-center gap-2">
                {importing ? (
                  <><span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Importing...</>
                ) : (
                  <><Users className="w-4 h-4" /> Import {rows.length > 0 ? rows.length : ''} Employees</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
