import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Card, CardContent } from '../ui/card';
import SiteSettings from './SiteSettings';
import { Settings } from 'lucide-react';

export const AdminSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Settings</h2>
        <p className="text-sm text-slate-500 mt-1">Global site profile and notification configuration</p>
      </div>

      <Tabs defaultValue="site" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="site">Site Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="site">
          <SiteSettings />
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardContent className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Settings className="w-12 h-12 opacity-20" />
              <h3 className="text-lg font-black text-slate-500">Coming Soon</h3>
              <p className="text-sm">Email, SMS and in-app notification workflows</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
