import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { SiteSettings } from './SiteSettings';
import { NotificationSettings } from './NotificationSettings';
import { ScheduledReports } from './ScheduledReports';
import { DeviceThresholdSettings } from './DeviceThresholdSettings';
import { HolidayCalendar } from './HolidayCalendar';

export const AdminSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Site Management</h2>
        <p className="text-sm text-slate-500 mt-1">Configure site profile, notifications, scheduled reports, device thresholds and holiday calendars</p>
      </div>

      <Tabs defaultValue="site" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 max-w-3xl">
          <TabsTrigger value="site">Site Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
        </TabsList>
        <TabsContent value="site"><SiteSettings /></TabsContent>
        <TabsContent value="notifications"><NotificationSettings /></TabsContent>
        <TabsContent value="reports"><ScheduledReports /></TabsContent>
        <TabsContent value="thresholds"><DeviceThresholdSettings /></TabsContent>
        <TabsContent value="holidays"><HolidayCalendar /></TabsContent>
      </Tabs>
    </div>
  );
};
