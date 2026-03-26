import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import {
  LogOut,
  Moon,
  Sun,
  User,
  Bell,
  ScanFace,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet';

interface SidebarProps {
  title: string;
  unreadAlerts?: number;
  navigationItems?: Array<{
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    value: string;
  }>;
  activeTab?: string;
  onNavigate?: (value: string) => void;
  liveAlerts?: Array<{title:string; message:string; severity:string; created_at:string; is_read:boolean}>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  title,
  unreadAlerts = 0,
  navigationItems = [],
  activeTab,
  onNavigate,
  liveAlerts = [],
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const { user, logout, accessToken } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-screen border-r flex flex-col z-20 hidden md:flex transition-all duration-300",
      isCollapsed ? "w-20" : "w-64",
      lightTheme.background.sidebar,
      lightTheme.border.default,
      "dark:bg-gray-800 dark:border-gray-700"
    )}>
      {/* Logo & Title */}
      <div className={cn("p-4 border-b flex items-center", lightTheme.border.default, "dark:border-gray-700", isCollapsed ? "justify-center" : "justify-between")}>
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shrink-0">
              <ScanFace className="w-5 h-5 text-white" />
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800 animate-pulse"></div>
            </div>
            <div className="flex-1 overflow-hidden">
              <h1 className={cn("text-base font-bold leading-tight truncate", lightTheme.text.primary, "dark:text-white")}>FaceAttend</h1>
            </div>
          </div>
        )}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onToggleCollapse}
          className="shrink-0"
        >
          {isCollapsed ? <ChevronRight className="w-5 h-5 text-slate-500" /> : <ChevronLeft className="w-5 h-5 text-slate-500" />}
        </Button>
      </div>
      {!isCollapsed && (
        <div className="mt-3 px-6 flex items-center justify-between pb-4 border-b dark:border-gray-700">
          <p className={cn("text-xs capitalize", lightTheme.text.secondary, "dark:text-gray-400")}>
            {user?.role} Portal
          </p>
          <Badge className={cn("text-[10px] px-1.5 py-0.5 h-auto border-0", lightTheme.status.infoBg, lightTheme.status.info, "dark:bg-blue-900/30 dark:text-blue-300")}>
            AI Powered
          </Badge>
        </div>
      )}

      {/* Navigation Items */}
      {navigationItems.length > 0 && (
        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.value;

              return (
                <button
                  key={item.value}
                  onClick={() => onNavigate?.(item.value)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-all group",
                    isCollapsed ? "justify-center px-0 py-3" : "px-4 py-3",
                    isActive
                      ? cn(lightTheme.sidebar.activeMenu, "dark:bg-blue-600 dark:text-white")
                      : cn(lightTheme.sidebar.inactiveMenu, "dark:text-gray-300 dark:hover:bg-gray-700")
                  )}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className={cn("shrink-0", isCollapsed ? "w-6 h-6" : "w-5 h-5")} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Bottom Actions */}
      <div className={cn("p-4 border-t space-y-3", lightTheme.border.default, "dark:border-gray-700")}>
        {/* User Info */}
        {!isCollapsed && (
          <div className={cn("flex items-center gap-3 px-3 py-2 rounded-lg", lightTheme.background.secondary, "dark:bg-gray-700/50")}>
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium truncate", lightTheme.text.primary, "dark:text-white")}>{user?.name}</p>
              <p className={cn("text-xs truncate", lightTheme.text.secondary, "dark:text-gray-400")}>{user?.email}</p>
            </div>
          </div>
        )}

        {/* Notifications */}
        <Sheet onOpenChange={async (open) => {
          if (open && unreadAlerts > 0 && accessToken) {
            try {
              await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://172.20.100.222:8080/api'}/live/alerts/mark-read`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${accessToken}`,
                  'x-tenant-id': '1',
                },
                body: JSON.stringify({}),
              });
            } catch (_) {}
          }
        }}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size={isCollapsed ? "icon" : "sm"}
              className={cn("w-full relative text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700", isCollapsed ? "justify-center" : "justify-start")}
              title={isCollapsed ? "Notifications" : undefined}
            >
              <Bell className={cn("w-4 h-4", !isCollapsed && "mr-2")} />
              {!isCollapsed && "Notifications"}
              {unreadAlerts > 0 && (
                <Badge
                  className={cn("h-5 min-w-[20px] flex items-center justify-center px-1 text-xs", isCollapsed ? "absolute -top-2 -right-2" : "ml-auto")}
                  variant="destructive"
                >
                  {unreadAlerts}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[400px] sm:w-[540px] overflow-y-auto">
            <SheetHeader className="mb-6">
              <div className="flex items-center justify-between">
                <SheetTitle>Notifications</SheetTitle>
                {liveAlerts.length > 0 && (
                  <button
                    className="text-xs text-blue-500 hover:underline"
                    onClick={async () => {
                      try {
                        await fetch('/api/live/alerts/mark-read', { method: 'POST',
                          headers: { 'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}` },
                          body: JSON.stringify({}) });
                      } catch (_) {}
                    }}>
                    Mark all read
                  </button>
                )}
              </div>
            </SheetHeader>
            <div className="flex flex-col gap-4">
              {liveAlerts.length > 0 ? (
                liveAlerts.map((alert, index) => ( <div 
                    key={alert.id}
                    className={cn(
                      "p-4 rounded-lg border",
                      alert.severity === 'critical' || alert.severity === 'high'
                        ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/50"
                        : alert.severity === 'medium'
                          ? "bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-900/50"
                          : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/50"
                    )}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h4 className={cn(
                        "text-sm font-semibold",
                        alert.severity === 'critical' || alert.severity === 'high'
                          ? "text-red-800 dark:text-red-400"
                          : alert.severity === 'medium'
                            ? "text-yellow-800 dark:text-yellow-400"
                            : "text-blue-800 dark:text-blue-400"
                      )}>
                        {alert.title}
                      </h4>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(alert.created_at || alert.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{alert.message}</p>
                  </div>
                ))
              ) : (
                <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
                  No notifications at the moment.
                </p>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Theme Toggle */}
        <Button
          variant="outline"
          size={isCollapsed ? "icon" : "sm"}
          className={cn("w-full text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700", isCollapsed ? "justify-center" : "justify-start")}
          onClick={toggleTheme}
          title={isCollapsed ? (theme === 'light' ? "Dark Mode" : "Light Mode") : undefined}
        >
          {theme === 'light' ? (
            <>
              <Moon className={cn("w-4 h-4", !isCollapsed && "mr-2")} />
              {!isCollapsed && "Dark Mode"}
            </>
          ) : (
            <>
              <Sun className={cn("w-4 h-4", !isCollapsed && "mr-2")} />
              {!isCollapsed && "Light Mode"}
            </>
          )}
        </Button>

        {/* Logout Button */}
        <Button
          variant="destructive"
          size={isCollapsed ? "icon" : "sm"}
          className={cn("w-full", isCollapsed ? "justify-center" : "justify-start")}
          onClick={logout}
          title={isCollapsed ? "Logout" : undefined}
        >
          <LogOut className={cn("w-4 h-4", !isCollapsed && "mr-2")} />
          {!isCollapsed && "Logout"}
        </Button>
      </div>
    </aside>
  );
};
