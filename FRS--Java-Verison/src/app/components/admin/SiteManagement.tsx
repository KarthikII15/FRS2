import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Building2, Plus, Edit, Trash2, Search, RefreshCw, 
  MapPin, Clock, Loader2, CheckCircle2, AlertCircle, Server, Settings
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { DeviceAssignment } from './DeviceAssignment';

interface Site {
  pk_site_id: number;
  site_name: string;
  location_address: string;
  timezone: string;
  status: 'active' | 'inactive';
  device_count: number;
  config: {
    attendance_rules?: any;
    recognition_settings?: any;
    direction_detection?: any;
    unauthorized_access_policy?: any;
  };
}

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'IST — India (UTC+5:30)' },
  { value: 'Asia/Dubai', label: 'GST — Dubai (UTC+4)' },
  { value: 'Asia/Singapore', label: 'SGT — Singapore (UTC+8)' },
  { value: 'Europe/London', label: 'GMT — London (UTC+0)' },
  { value: 'America/New_York', label: 'EST — New York (UTC-5)' },
  { value: 'America/Los_Angeles', label: 'PST — Los Angeles (UTC-8)' },
];

const StatusBadge = ({ status }: { status: string }) => {
  const colors = {
    active: 'bg-green-100 text-green-700 border-green-200',
    inactive: 'bg-slate-100 text-slate-600 border-slate-200'
  };
  const icons = {
    active: CheckCircle2,
    inactive: AlertCircle
  };
  const Icon = icons[status as keyof typeof icons] || AlertCircle;
  
  return (
    <Badge className={cn('border px-2 py-1', colors[status as keyof typeof colors] || colors.inactive)}>
      <Icon className="w-3 h-3 mr-1" />
      {(status?.toString() || 'unknown').charAt(0).toUpperCase() + (status?.toString() || 'unknown').slice(1)}
    </Badge>
  );
};

export const SiteManagement: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Create/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteForm, setSiteForm] = useState({
    site_name: '',
    location_address: '',
    timezone: 'Asia/Kolkata',
    status: 'active' as 'active' | 'inactive'
  });
  const [isSaving, setIsSaving] = useState(false);

  // Device Assignment Modal
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [assignmentSite, setAssignmentSite] = useState<Site | null>(null);

  const fetchSites = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; sites: Site[] }>(
        '/site-management/sites',
        { accessToken, scopeHeaders }
      );
      if (res.success) {
        setSites(res.sites || []);
      }
    } catch (error) {
      toast.error('Failed to load sites');
      console.error('Fetch sites error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, scopeHeaders]);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  const openCreateModal = () => {
    setEditingSite(null);
    setSiteForm({
      site_name: '',
      location_address: '',
      timezone: 'Asia/Kolkata',
      status: 'active'
    });
    setIsModalOpen(true);
  };

  const openEditModal = (site: Site) => {
    setEditingSite(site);
    setSiteForm({
      site_name: site.site_name,
      location_address: site.location_address,
      timezone: site.timezone,
      status: site.status
    });
    setIsModalOpen(true);
  };

  const openDeviceAssignment = (site: Site) => {
    setAssignmentSite(site);
    setIsAssignmentOpen(true);
  };

  const handleSave = async () => {
    if (!siteForm.site_name || !siteForm.location_address) {
      return toast.error('Site name and location are required');
    }

    setIsSaving(true);
    try {
      if (editingSite) {
        const res = await apiRequest<{ success: boolean }>(
          `/site-management/sites/${editingSite.pk_site_id}`,
          {
            method: 'PATCH',
            accessToken,
            scopeHeaders,
            body: JSON.stringify(siteForm)
          }
        );
        if (res.success) {
          toast.success('Site updated successfully!');
        }
      } else {
        const res = await apiRequest<{ success: boolean }>(
          '/site-management/sites',
          {
            method: 'POST',
            accessToken,
            scopeHeaders,
            body: JSON.stringify(siteForm)
          }
        );
        if (res.success) {
          toast.success('Site created successfully!');
        }
      }
      setIsModalOpen(false);
      fetchSites();
    } catch (error) {
      toast.error(editingSite ? 'Failed to update site' : 'Failed to create site');
      console.error('Save site error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (site: Site) => {
    if (!confirm(`Delete ${site.site_name}? This cannot be undone.`)) return;

    try {
      const res = await apiRequest<{ success: boolean }>(
        `/site-management/sites/${site.pk_site_id}`,
        {
          method: 'DELETE',
          accessToken,
          scopeHeaders
        }
      );
      if (res.success) {
        toast.success('Site deleted successfully');
        fetchSites();
      }
    } catch (error: any) {
      const message = error.message || 'Failed to delete site';
      toast.error(message);
    }
  };

  const filteredSites = sites.filter(site => {
    const matchesSearch = site.site_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         site.location_address.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || site.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Site Management</h2>
          <p className="text-sm text-slate-500 mt-1">Manage facilities, locations, and site configurations</p>
        </div>
        <Button onClick={openCreateModal} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Site
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search sites..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={fetchSites} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredSites.map(site => (
            <Card key={site.pk_site_id} className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-white">{site.site_name}</h3>
                      <p className="text-xs text-slate-500">ID: {site.pk_site_id}</p>
                    </div>
                  </div>
                  <StatusBadge status={site.status} />
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                    <span className="text-slate-600 dark:text-slate-300">{site.location_address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-300">{site.timezone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-slate-400" />
                    <span className="font-medium">{site.device_count || 0} Devices</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDeviceAssignment(site)}
                    className="gap-1"
                  >
                    <Settings className="w-3 h-3" />
                    Devices
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditModal(site)}
                    className="gap-1"
                  >
                    <Edit className="w-3 h-3" />
                    Edit
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(site)}
                  className="w-full mt-2 gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete Site
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filteredSites.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <p className="text-slate-500">No sites found</p>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSite ? 'Edit Site' : 'Create New Site'}</DialogTitle>
            <DialogDescription>
              {editingSite ? 'Update site information' : 'Add a new facility or location'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Site Name *</Label>
              <Input
                placeholder="Headquarters"
                value={siteForm.site_name}
                onChange={(e) => setSiteForm({ ...siteForm, site_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Location Address *</Label>
              <Input
                placeholder="123 Main St, City, Country"
                value={siteForm.location_address}
                onChange={(e) => setSiteForm({ ...siteForm, location_address: e.target.value })}
              />
            </div>
            <div>
              <Label>Timezone</Label>
              <Select
                value={siteForm.timezone}
                onValueChange={(value) => setSiteForm({ ...siteForm, timezone: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={siteForm.status}
                onValueChange={(value: 'active' | 'inactive') => setSiteForm({ ...siteForm, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="flex-1 gap-2">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {editingSite ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Device Assignment Modal */}
      {assignmentSite && (
        <DeviceAssignment
          isOpen={isAssignmentOpen}
          onClose={() => setIsAssignmentOpen(false)}
          siteId={assignmentSite.pk_site_id}
          siteName={assignmentSite.site_name}
          accessToken={accessToken}
          scopeHeaders={scopeHeaders}
          onAssignmentChange={fetchSites}
        />
      )}
    </div>
  );
};
