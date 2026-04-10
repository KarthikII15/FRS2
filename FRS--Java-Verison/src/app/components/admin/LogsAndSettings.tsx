import React from 'react';
import { FileText } from 'lucide-react';
import { LiveAuditLog } from './LiveAuditLog';

export const LogsAndSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* CONTENT */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <LiveAuditLog />
      </div>
    </div>
  );
};
