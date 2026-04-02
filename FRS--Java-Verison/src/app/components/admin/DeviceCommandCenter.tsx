import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { apiRequest } from '../../services/http/apiClient';
import { cn } from '../ui/utils';
import {
  Building2, Layers, MapPin, Cpu, Camera, Wifi, WifiOff,
  Plus, Edit2, Trash2, RefreshCw, Settings, ChevronDown,
  ChevronRight, Thermometer, MemoryStick, Activity, Zap,
  X, Save, Check, AlertTriangle, Map, List, ZoomIn, ZoomOut, Maximize
} from 'lucide-react';
import { TransformWrapper, TransformComponent, useControls } from 'react-zoom-pan-pinch';

import { lightTheme } from '../../../theme/lightTheme';
import { realtimeEngine } from '../../engine/RealTimeEngine';

// ── Types ──────────────────────────────────────────────────────
interface Building { pk_building_id: string; name: string; address: string; floor_count: number; nug_count: number; camera_count: number; }
interface Floor { pk_floor_id: string; fk_building_id: string; floor_number: number; floor_name: string; floor_plan_url: string|null; floor_plan_data: any; nug_count: number; camera_count: number; }
interface Zone { pk_zone_id: string; fk_floor_id: string; zone_name: string; zone_type: string; camera_count: number; }
interface NugBox {
  pk_nug_id: string; name: string; device_code: string; ip_address: string; port: number;
  status: string; building_name: string; floor_name: string; floor_number: number; zone_name: string;
  fk_building_id: string|null; fk_floor_id: string|null; fk_zone_id: string|null;
  cpu_percent: number|null; memory_used_mb: number|null; memory_total_mb: number|null;
  gpu_percent: number|null; temperature_c: number|null; disk_used_gb: number|null; uptime_seconds: number|null;
  match_threshold: number; conf_threshold: number; cooldown_seconds: number; x_threshold: number; tracking_window: number;
  camera_count: number; cameras_online: number; map_x: number|null; map_y: number|null; last_heartbeat: string|null;
}
interface Camera {
  pk_camera_id: string; fk_nug_id: string; fk_floor_id: string|null; fk_zone_id: string|null;
  name: string; cam_id: string; ip_address: string;
  rtsp_url: string; model: string; status: string; recognition_accuracy: number; total_scans: number;
  error_rate: number; floor_name: string; zone_name: string; nug_name: string;
  map_x: number|null; map_y: number|null; map_angle: number; last_active: string|null;
}
interface Hierarchy { buildings: Building[]; floors: Floor[]; zones: Zone[]; nug_boxes: NugBox[]; cameras: Camera[]; }

// ── Helpers ────────────────────────────────────────────────────
const statusColor = (s: string) => s === 'online' ? 'text-emerald-500' : s === 'error' ? 'text-rose-500' : 'text-slate-400';
const statusBg = (s: string) => s === 'online' ? 'bg-emerald-500' : s === 'error' ? 'bg-rose-500' : 'bg-slate-400';
const fmtUptime = (s: number|null) => { if (!s) return '—'; const n=Number(s); const d=Math.floor(n/86400),h=Math.floor((n%86400)/3600),m=Math.floor((n%3600)/60); return d>0?`${d}d ${h}h`:h>0?`${h}h ${m}m`:`${m}m`; };
const fmtTemp = (t: number|null) => t != null && t !== 0 ? `${Number(t).toFixed(1)}°C` : '—';
const fmtMem = (used: number|null, total: number|null) => used && total ? `${(Number(used)/1024).toFixed(1)}/${(Number(total)/1024).toFixed(1)}GB` : '—';

// ── Stat Bar ───────────────────────────────────────────────────
function StatBar({ label, value, max=100, unit='%', color='bg-blue-500' }: { label:string; value:number|string|null; max?:number; unit?:string; color?:string }) {
  const pct = value != null ? Math.min(100, (Number(value)/max)*100) : 0;
  const warn = pct > 80;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500">{label}</span>
        <span className={cn("font-semibold", warn?"text-amber-500":"text-slate-700 dark:text-slate-300")}>
          {value != null ? `${Number(value).toFixed(1)}${unit}` : '—'}
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", warn?"bg-amber-500":color)} style={{width:`${pct}%`}} />
      </div>
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide=false }: { title:string; onClose:()=>void; children:React.ReactNode; wide?:boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className={cn("bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full overflow-hidden max-h-[90vh] flex flex-col", wide?"max-w-2xl":"max-w-md")} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4 text-slate-500"/></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const input = "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

// ── Floor Map Canvas ───────────────────────────────────────
function FloorMap({ floor, nugs, cameras, onSavePosition, onSaveFloorPlan }: {
  floor: Floor; nugs: NugBox[]; cameras: Camera[];
  onSavePosition: (type:'nug'|'camera', id:string, x:number, y:number, angle?:number) => void;
  onSaveFloorPlan: (floorId:string, dataUrl:string) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{type:'nug'|'camera';id:string;} | null>(null);
  const [positions, setPositions] = useState<Record<string,{x:number;y:number;angle:number}>>({});
  const [bgImage, setBgImage] = useState<string|null>(floor.floor_plan_url);
  const [selectedPin, setSelectedPin] = useState<{type:'nug'|'camera';id:string}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // References to active pins for direct DOM manipulation during drag
  const pinRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const pos: Record<string,{x:number;y:number;angle:number}> = {};
    nugs.forEach(n => { pos[`nug_${n.pk_nug_id}`] = {x:n.map_x??20,y:n.map_y??30,angle:0}; });
    cameras.forEach(c => { pos[`cam_${c.pk_camera_id}`] = {x:c.map_x??50,y:c.map_y??60,angle:c.map_angle??0}; });
    setPositions(pos);
  }, [nugs, cameras]);

  const getPos = (type:'nug'|'camera', id:string) => positions[`${type==='nug'?'nug':'cam'}_${id}`] || {x:50,y:50,angle:0};

  const handleMouseDown = (type:'nug'|'camera', id:string, e:React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); // Prevents map panning
    setDragging({type,id});
    setSelectedPin({type,id});
  };

  const handleMouseMove = (e:React.MouseEvent) => {
    if (!dragging) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    // In a zoomed container, bounding client rect gives the SCALED visible dimensions.
    // However, react-zoom-pan-pinch applies transforms to the wrapper.
    // To calculate absolute percentage correctly during zoom/pan, it's easier to disable pointer-events on the canvas or calculate based on the scaled element.
    // For simplicity, we calculate raw % on the internal unscaled canvas bounding rect
    const x = Math.max(2,Math.min(98,((e.clientX-rect.left)/rect.width)*100));
    const y = Math.max(2,Math.min(98,((e.clientY-rect.top)/rect.height)*100));
    const key = `${dragging.type==='nug'?'nug':'cam'}_${dragging.id}`;

    // Direct DOM update for 60fps dragging
    const pinEl = pinRefs.current[key];
    if (pinEl) {
      pinEl.style.left = `${x}%`;
      pinEl.style.top = `${y}%`;
    }
  };

  const handleMouseUp = (e?: React.MouseEvent) => {
    if (!dragging) return;
    // Calculate final position from direct styles if available
    const key = `${dragging.type==='nug'?'nug':'cam'}_${dragging.id}`;
    const pinEl = pinRefs.current[key];
    if (pinEl) {
      const finalX = parseFloat(pinEl.style.left);
      const finalY = parseFloat(pinEl.style.top);
      if (!isNaN(finalX) && !isNaN(finalY)) {
        const currentPos = positions[key] || {angle: 0};
        setPositions(p=>({...p, [key]: {...currentPos, x: finalX, y: finalY}}));
        onSavePosition(dragging.type, dragging.id, finalX, finalY, currentPos.angle);
      }
    }
    setDragging(null);
  };

  const handleRotate = (camId:string, delta:number) => {
    const key = `cam_${camId}`;
    const newAngle = ((positions[key]?.angle||0) + delta + 360) % 360;
    setPositions(p=>({...p,[key]:{...p[key],angle:newAngle}}));
    const pos = positions[key];
    if (pos) onSavePosition('camera', camId, pos.x, pos.y, newAngle);
  };

  const handleFileUpload = (e:React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setBgImage(dataUrl);
      onSaveFloorPlan(floor.pk_floor_id, dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const floorNugs = nugs.filter(n => String(n.fk_floor_id) === floor.pk_floor_id);
  const floorCams = cameras.filter(c => String(c.fk_floor_id) === floor.pk_floor_id);

  // Get selected item details
  const selectedNug = selectedPin?.type==='nug' ? floorNugs.find(n=>n.pk_nug_id===selectedPin.id) : null;
  const selectedCam = selectedPin?.type==='camera' ? floorCams.find(c=>c.pk_camera_id===selectedPin.id) : null;

  // Zoom Control Actions Inner Component
  const MapControls = () => {
    const { zoomIn, zoomOut, resetTransform } = useControls();
    return (
      <div className="absolute top-2 right-2 flex flex-col gap-1 z-[1] bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 p-1">
        <button onClick={()=>zoomIn()} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded"><ZoomIn className="w-4 h-4"/></button>
        <button onClick={()=>zoomOut()} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded"><ZoomOut className="w-4 h-4"/></button>
        <button onClick={()=>resetTransform()} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded"><Maximize className="w-4 h-4"/></button>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Drag map to pan · Scroll to zoom · Drag devices to position</p>
        <div className="flex gap-2">
          {bgImage && (
            <button onClick={() => { setBgImage(null); onSaveFloorPlan(floor.pk_floor_id, ''); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 border border-rose-200 rounded-lg">
              Remove Plan
            </button>
          )}
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <Map className="w-3.5 h-3.5"/> {bgImage ? 'Change Floor Plan' : 'Upload Floor Plan'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload}/>
        </div>
      </div>

      <div className="flex gap-3 h-[500px]">
        {/* Map Canvas with TransformWrapper */}
        <div className="flex-1 relative rounded-xl border-2 border-slate-300 dark:border-slate-600 overflow-hidden bg-slate-100 dark:bg-slate-900">
          <TransformWrapper 
            initialScale={1} minScale={0.5} maxScale={4}
            panning={{ disabled: dragging !== null }}
            wheel={{ disabled: dragging !== null }}
            pinch={{ disabled: dragging !== null }}
          >
            <MapControls />
            <TransformComponent wrapperClass="w-full h-full" contentClass="w-full h-full cursor-grab active:cursor-grabbing">
              <div
                ref={canvasRef}
                className="relative w-full h-full select-none"
                style={{ background: bgImage ? `url(${bgImage}) center/contain no-repeat` : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={() => setSelectedPin(null)}
              >
                {!bgImage && (
                  <>
                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20 pointer-events-none">
                      <Map className="w-16 h-16 text-slate-400 mb-2"/>
                      <p className="text-sm font-medium text-slate-500">Upload a floor plan or use as grid</p>
                    </div>
                    <svg className="absolute inset-0 w-full h-full opacity-10 pointer-events-none">
                      <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#94a3b8" strokeWidth="0.5"/>
                      </pattern></defs>
                      <rect width="100%" height="100%" fill="url(#grid)"/>
                    </svg>
                  </>
                )}

                {/* SVG layer for connection lines */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{zIndex:1}}>
                  {floorNugs.map(nug => {
                    const nugPos = getPos('nug', nug.pk_nug_id);
                    const nugCams = floorCams.filter(c => c.fk_nug_id === nug.pk_nug_id);
                    return nugCams.map(cam => {
                      const camPos = getPos('camera', cam.pk_camera_id);
                      return (
                        <line key={`${nug.pk_nug_id}-${cam.pk_camera_id}`}
                          x1={`${nugPos.x}%`} y1={`${nugPos.y}%`}
                          x2={`${camPos.x}%`} y2={`${camPos.y}%`}
                          stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="6,4"
                          strokeOpacity="0.5"
                        />
                      );
                    });
                  })}
                </svg>

                {/* NUG Box pins */}
                {floorNugs.map(nug => {
                  const pos = getPos('nug', nug.pk_nug_id);
                  const isSelected = selectedPin?.type==='nug' && selectedPin.id===nug.pk_nug_id;
                  return (
                    <div key={nug.pk_nug_id}
                      ref={el => { pinRefs.current[`nug_${nug.pk_nug_id}`] = el; }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
                      style={{left:`${pos.x}%`,top:`${pos.y}%`,zIndex:isSelected?20:10}}
                      onMouseDown={e=>handleMouseDown('nug',nug.pk_nug_id,e)}
                      onClick={e=>{e.stopPropagation();setSelectedPin({type:'nug',id:nug.pk_nug_id});}}
                    >
                      <div className="relative hover:scale-110 transition-transform">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shadow-lg border-2",
                          nug.status==='online'?"bg-blue-600 border-blue-400":"bg-slate-500 border-slate-400",
                          isSelected?"ring-4 ring-blue-300 scale-125":""
                        )}>
                          <Cpu className="w-5 h-5 text-white"/>
                        </div>
                        <div className={cn("absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white",
                          nug.status==='online'?"bg-emerald-500":"bg-slate-400"
                        )}/>
                        <p className="text-[9px] font-bold text-center mt-0.5 bg-white/80 dark:bg-slate-900/80 rounded px-1 max-w-[80px] truncate text-slate-700 dark:text-slate-300">{nug.name.split('-')[0]}</p>
                      </div>
                    </div>
                  );
                })}

            {/* Camera pins with direction arrow */}
            {floorCams.map(cam => {
              const pos = getPos('camera', cam.pk_camera_id);
              const isSelected = selectedPin?.type==='camera' && selectedPin.id===cam.pk_camera_id;
              const angle = pos.angle || 0;
              return (
                <div key={cam.pk_camera_id}
                  ref={el => { pinRefs.current[`cam_${cam.pk_camera_id}`] = el; }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
                  style={{left:`${pos.x}%`,top:`${pos.y}%`,zIndex:isSelected?20:10}}
                  onMouseDown={e=>handleMouseDown('camera',cam.pk_camera_id,e)}
                  onClick={e=>{e.stopPropagation();setSelectedPin({type:'camera',id:cam.pk_camera_id});}}
                >
                  <div className="relative hover:scale-110 transition-transform">
                    {/* Direction cone */}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 pointer-events-none"
                      style={{transform:`translateX(-50%) rotate(${angle}deg)`, transformOrigin:'50% 100%'}}>
                      <svg width="24" height="24" viewBox="0 0 24 24">
                        <path d="M12 2 L20 20 L12 16 L4 20 Z" fill={cam.status==='online'?"#10b981":"#94a3b8"} fillOpacity="0.6"/>
                      </svg>
                    </div>
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shadow-lg border-2",
                        cam.status==='online'?"bg-emerald-600 border-emerald-400":"bg-slate-500 border-slate-400",
                        isSelected?"ring-4 ring-emerald-300 scale-125":""
                      )}>
                      <Camera className="w-4 h-4 text-white"/>
                    </div>
                    <div className={cn("absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white",
                      cam.status==='online'?"bg-emerald-500":"bg-slate-400"
                    )}/>
                    <p className="text-[9px] font-bold text-center mt-0.5 bg-white/80 dark:bg-slate-900/80 rounded px-1 max-w-[70px] truncate text-slate-700 dark:text-slate-300">{cam.name.split(' ')[0]}</p>
                    {/* Rotate controls when selected */}
                    {isSelected && (
                      <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex gap-1">
                        <button onClick={e=>{e.stopPropagation();handleRotate(cam.pk_camera_id,-15);}}
                          className="w-5 h-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold text-slate-600 hover:bg-slate-100 flex items-center justify-center">↺</button>
                        <span className="text-[9px] font-mono bg-white/90 dark:bg-slate-800/90 px-1 rounded text-slate-600">{angle}°</span>
                        <button onClick={e=>{e.stopPropagation();handleRotate(cam.pk_camera_id,15);}}
                          className="w-5 h-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold text-slate-600 hover:bg-slate-100 flex items-center justify-center">↻</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </TransformComponent>
          </TransformWrapper>
          
          {/* Legend */}
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-600"/> NUG Box</span>
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-600"/> Camera</span>
            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"/> Online</span>
            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-slate-400"/> Offline</span>
            <span className="flex items-center gap-1.5"><svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,3"/></svg> NUG→Camera</span>
          </div>
        </div>

        {/* Selected pin stats panel */}
        {(selectedNug || selectedCam) && (
          <div className="w-56 flex-shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-3 self-start">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase">{selectedNug ? 'NUG Box' : 'Camera'}</p>
              <button onClick={()=>setSelectedPin(null)} className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"><X className="w-3.5 h-3.5 text-slate-400"/></button>
            </div>
            {selectedNug && (
              <>
                <div>
                  <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{selectedNug.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{selectedNug.ip_address}:{selectedNug.port}</p>
                </div>
                <div className={cn("text-xs font-bold px-2 py-1 rounded-full text-center",
                  selectedNug.status==='online'?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-500")}>
                  {selectedNug.status?.toUpperCase()}
                </div>
                {selectedNug.cpu_percent != null && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs"><span className="text-slate-400">CPU</span><span className="font-semibold">{Number(selectedNug.cpu_percent).toFixed(1)}%</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-400">RAM</span><span className="font-semibold">{selectedNug.memory_used_mb && selectedNug.memory_total_mb ? `${(Number(selectedNug.memory_used_mb)/1024).toFixed(1)}/${(Number(selectedNug.memory_total_mb)/1024).toFixed(1)}GB` : '—'}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-400">Temp</span><span className="font-semibold">{selectedNug.temperature_c ? `${Number(selectedNug.temperature_c).toFixed(1)}°C` : '—'}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-400">Cameras</span><span className="font-semibold">{selectedNug.camera_count} ({selectedNug.cameras_online} online)</span></div>
                  </div>
                )}
                {selectedNug.last_heartbeat && <p className="text-[10px] text-slate-400">Last seen {new Date(selectedNug.last_heartbeat).toLocaleTimeString()}</p>}
              </>
            )}
            {selectedCam && (
              <>
                <div>
                  <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{selectedCam.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{selectedCam.ip_address}</p>
                </div>
                <div className={cn("text-xs font-bold px-2 py-1 rounded-full text-center",
                  selectedCam.status==='online'?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-500")}>
                  {selectedCam.status?.toUpperCase()}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs"><span className="text-slate-400">Accuracy</span><span className="font-semibold text-emerald-600">{selectedCam.recognition_accuracy}%</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-400">Total Scans</span><span className="font-semibold">{Number(selectedCam.total_scans).toLocaleString()}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-400">Direction</span><span className="font-semibold">{getPos('camera',selectedCam.pk_camera_id).angle}°</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-400">Model</span><span className="font-semibold truncate max-w-[100px]">{selectedCam.model||'—'}</span></div>
                </div>
                {selectedCam.last_active && <p className="text-[10px] text-slate-400">Last active {new Date(selectedCam.last_active).toLocaleTimeString()}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export function DeviceCommandCenter({ defaultView }: { defaultView?: 'hierarchy' | 'map' } = {}) {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [hierarchy, setHierarchy] = useState<Hierarchy>({ buildings:[], floors:[], zones:[], nug_boxes:[], cameras:[] });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'hierarchy'|'map'>(defaultView || 'hierarchy');
  const [selectedBuilding, setSelectedBuilding] = useState<string|null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string|null>(null);
  const [expandedNugs, setExpandedNugs] = useState<Set<string>>(new Set());
  const [pingStatus, setPingStatus] = useState<Record<string,{loading:boolean;result?:any}>>({});

  // Modals
  const [buildingModal, setBuildingModal] = useState<{mode:'add'|'edit';data?:Building}|null>(null);
  const [floorModal, setFloorModal] = useState<{mode:'add'|'edit';data?:Floor;buildingId?:string}|null>(null);
  const [nugModal, setNugModal] = useState<{mode:'add'|'edit';data?:NugBox}|null>(null);
  const [cameraModal, setCameraModal] = useState<{mode:'add'|'edit';data?:Camera;nugId?:string}|null>(null);
  const [configModal, setConfigModal] = useState<NugBox|null>(null);

  // Forms
  const [buildingForm, setBuildingForm] = useState({name:'',address:''});
  const [floorForm, setFloorForm] = useState({floor_number:'',floor_name:''});
  const [nugForm, setNugForm] = useState({name:'',device_code:'',ip_address:'',port:'5000',fk_building_id:'',fk_floor_id:'',fk_zone_id:''});
  const [cameraForm, setCameraForm] = useState({name:'',cam_id:'',rtsp_url:'',ip_address:'',model:'',fk_nug_id:'',fk_floor_id:'',fk_zone_id:''});
  const [configForm, setConfigForm] = useState({match_threshold:0.38,conf_threshold:0.35,cooldown_seconds:3,x_threshold:25,tracking_window:6});

  const opts = useCallback(()=>({accessToken,scopeHeaders}),[accessToken]);

  const fetchHierarchy = useCallback(async()=>{
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await apiRequest<Hierarchy>('/devices/hierarchy',opts());
      setHierarchy(res);
      if (!selectedBuilding && res.buildings.length) setSelectedBuilding(res.buildings[0].pk_building_id);
    } catch {}
    setLoading(false);
  },[accessToken]);

  useEffect(() => {
    fetchHierarchy();
  }, [fetchHierarchy]);

  // Real-time synchronization
  useEffect(() => {
    const socket = (realtimeEngine as any).socket;
    if (!socket) return;
    const onSync = () => fetchHierarchy();
    socket.on('deviceStatusUpdate', onSync);
    return () => {
      socket.off('deviceStatusUpdate', onSync);
    };
  }, [fetchHierarchy]);

  const ping = async(type:'nug'|'camera', id:string)=>{
    setPingStatus(p=>({...p,[id]:{loading:true}}));
    try {
      const path = type==='nug'?`/devices/nug-boxes/${id}/ping`:`/devices/cameras/${id}/ping`;
      const res = await apiRequest<any>(path,{...opts(),method:'POST'});
      setPingStatus(p=>({...p,[id]:{loading:false,result:res}}));
      setTimeout(()=>setPingStatus(p=>{const n={...p};delete n[id];return n;}),5000);
    } catch { setPingStatus(p=>({...p,[id]:{loading:false,result:{online:false}}})); }
  };

  const applyConfig = async(nugId:string)=>{
    await apiRequest(`/devices/nug-boxes/${nugId}`,{...opts(),method:'PUT',body:JSON.stringify(configForm)});
    await apiRequest(`/devices/nug-boxes/${nugId}/apply-config`,{...opts(),method:'POST'});
    setConfigModal(null); fetchHierarchy();
  };

  const savePosition = async(type:'nug'|'camera', id:string, x:number, y:number, angle?:number)=>{
    const path = type==='nug'?`/devices/nug-boxes/${id}`:`/devices/cameras/${id}`;
    await apiRequest(path,{...opts(),method:'PUT',body:JSON.stringify({map_x:x,map_y:y,...(angle!==undefined&&{map_angle:angle})})});
  };

  const saveFloorPlan = async(floorId:string, dataUrl:string)=>{
    await apiRequest(`/devices/floors/${floorId}/floor-plan`,{...opts(),method:'POST',body:JSON.stringify({floor_plan_url:dataUrl||null})});
    fetchHierarchy();
  };

  const savBuilding = async()=>{
    const method = buildingModal?.mode==='edit'?'PUT':'POST';
    const path = buildingModal?.mode==='edit'?`/devices/buildings/${buildingModal.data!.pk_building_id}`:'/devices/buildings';
    await apiRequest(path,{...opts(),method,body:JSON.stringify(buildingForm)});
    setBuildingModal(null); fetchHierarchy();
  };

  const savFloor = async()=>{
    const method = floorModal?.mode==='edit'?'PUT':'POST';
    const path = floorModal?.mode==='edit'?`/devices/floors/${floorModal.data!.pk_floor_id}`:`/devices/buildings/${floorModal?.buildingId}/floors`;
    await apiRequest(path,{...opts(),method,body:JSON.stringify(floorForm)});
    setFloorModal(null); fetchHierarchy();
  };

  const savNug = async()=>{
    const method = nugModal?.mode==='edit'?'PUT':'POST';
    const path = nugModal?.mode==='edit'?`/devices/nug-boxes/${nugModal.data!.pk_nug_id}`:'/devices/nug-boxes';
    await apiRequest(path,{...opts(),method,body:JSON.stringify(nugForm)});
    setNugModal(null); fetchHierarchy();
  };

  const savCamera = async()=>{
    const method = cameraModal?.mode==='edit'?'PUT':'POST';
    const path = cameraModal?.mode==='edit'?`/devices/cameras/${cameraModal.data!.pk_camera_id}`:'/devices/cameras';
    await apiRequest(path,{...opts(),method,body:JSON.stringify(cameraForm)});
    setCameraModal(null); fetchHierarchy();
  };

  const del = async(type:string, id:string)=>{
    if (!confirm(`Delete this ${type}?`)) return;
    await apiRequest(`/devices/${type}/${id}`,{...opts(),method:'DELETE'});
    fetchHierarchy();
  };

  // Derived
  const building = hierarchy.buildings.find(b=>b.pk_building_id===selectedBuilding);
  const buildingFloors = hierarchy.floors.filter(f=>f.fk_building_id===selectedBuilding);
  const activeFloor = selectedFloor ? hierarchy.floors.find(f=>f.pk_floor_id===selectedFloor) : buildingFloors[0];
  const floorNugs = activeFloor ? hierarchy.nug_boxes.filter(n=>String(n.fk_floor_id)===activeFloor.pk_floor_id) : [];
  const floorCams = activeFloor ? hierarchy.cameras.filter(c=>String(c.fk_floor_id)===activeFloor.pk_floor_id) : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Device Command Center</h2>
          <p className="text-xs text-slate-400 mt-0.5">{hierarchy.nug_boxes.length} NUG boxes · {hierarchy.cameras.length} cameras · {hierarchy.buildings.length} buildings</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button onClick={()=>setViewMode('hierarchy')} className={cn("px-3 py-1 text-xs font-semibold rounded-md transition-all",viewMode==='hierarchy'?"bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white":"text-slate-500")}>
              <List className="w-3.5 h-3.5 inline mr-1"/>Hierarchy
            </button>
            <button onClick={()=>setViewMode('map')} className={cn("px-3 py-1 text-xs font-semibold rounded-md transition-all",viewMode==='map'?"bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white":"text-slate-500")}>
              <Map className="w-3.5 h-3.5 inline mr-1"/>Floor Map
            </button>
          </div>
          <button onClick={fetchHierarchy} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><RefreshCw className={cn("w-4 h-4 text-slate-500",loading&&"animate-spin")}/></button>
          <button onClick={()=>{setBuildingForm({name:'',address:''});setBuildingModal({mode:'add'});}} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
            <Plus className="w-3.5 h-3.5"/> Add Building
          </button>
        </div>
      </div>

      {/* Building selector */}
      {hierarchy.buildings.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {hierarchy.buildings.map(b=>(
            <button key={b.pk_building_id} onClick={()=>{setSelectedBuilding(b.pk_building_id);setSelectedFloor(null);}} className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all",selectedBuilding===b.pk_building_id?"bg-blue-600 text-white border-blue-600":"bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300")}>
              <Building2 className="w-4 h-4"/>
              {b.name}
              <span className="text-[10px] opacity-70">{b.floor_count}F · {b.nug_count}N · {b.camera_count}C</span>
            </button>
          ))}
          {selectedBuilding && (
            <div className="flex items-center gap-1 ml-2">
              <button onClick={()=>{const b=building;if(b){setBuildingForm({name:b.name,address:b.address||''});setBuildingModal({mode:'edit',data:b});}}} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><Edit2 className="w-3.5 h-3.5"/></button>
              <button onClick={()=>del('buildings',selectedBuilding)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"><Trash2 className="w-3.5 h-3.5"/></button>
              <button onClick={()=>{setFloorForm({floor_number:'',floor_name:''});setFloorModal({mode:'add',buildingId:selectedBuilding});}} className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 border border-emerald-200 rounded-lg">
                <Plus className="w-3 h-3"/> Floor
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floor tabs */}
      {buildingFloors.length > 0 && (
        <div className="flex gap-1 border-b border-slate-100 dark:border-slate-800">
          {buildingFloors.map(f=>(
            <button key={f.pk_floor_id} onClick={()=>setSelectedFloor(f.pk_floor_id)} className={cn("px-4 py-2 text-sm font-semibold transition-all border-b-2 -mb-px",activeFloor?.pk_floor_id===f.pk_floor_id?"border-blue-600 text-blue-600":"border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}>
              {f.floor_name || `Floor ${f.floor_number}`}
              <span className="ml-1.5 text-[10px] opacity-60">{f.nug_count}N·{f.camera_count}C</span>
            </button>
          ))}
        </div>
      )}

      {/* ── HIERARCHY VIEW ── */}
      {viewMode === 'hierarchy' && activeFloor && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {activeFloor.floor_name} — {floorNugs.length} NUG boxes, {floorCams.length} cameras
            </h3>
            <button onClick={()=>{setNugForm({name:'',device_code:'',ip_address:'',port:'5000',fk_building_id:selectedBuilding||'',fk_floor_id:activeFloor.pk_floor_id,fk_zone_id:''});setNugModal({mode:'add'});}} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Plus className="w-3.5 h-3.5"/> Add NUG Box
            </button>
          </div>

          {floorNugs.map(nug=>{
            const expanded = expandedNugs.has(nug.pk_nug_id);
            const nugCams = hierarchy.cameras.filter(c=>c.fk_nug_id===nug.pk_nug_id);
            const ps = pingStatus[nug.pk_nug_id];
            return (
              <div key={nug.pk_nug_id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                {/* NUG Box Header */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm", nug.status==='online'?"bg-blue-600":"bg-slate-400")}>
                      <Cpu className="w-6 h-6 text-white"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white">{nug.name}</span>
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", nug.status==='online'?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-500")}>
                          {nug.status?.toUpperCase()}
                        </span>
                        {nug.last_heartbeat && <span className="text-[10px] text-slate-400">Last seen {new Date(nug.last_heartbeat).toLocaleTimeString()}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                        <span className="font-mono">{nug.ip_address}:{nug.port}</span>
                        <span>{nug.device_code}</span>
                        {nug.zone_name && <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/>{nug.zone_name}</span>}
                      </div>
                      {/* System stats */}
                      {(nug.cpu_percent != null || nug.temperature_c != null) && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                          <StatBar label="CPU" value={nug.cpu_percent} color="bg-blue-500"/>
                          <StatBar label="GPU" value={nug.gpu_percent} color="bg-violet-500"/>
                          <StatBar label="RAM" value={nug.memory_used_mb && nug.memory_total_mb ? (nug.memory_used_mb/nug.memory_total_mb)*100 : null} color="bg-emerald-500"/>
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-500 flex items-center gap-1"><Thermometer className="w-3 h-3"/>Temp</span>
                              <span className={cn("font-semibold", nug.temperature_c && nug.temperature_c>80?"text-rose-500":nug.temperature_c && nug.temperature_c>60?"text-amber-500":"text-slate-700 dark:text-slate-300")}>{fmtTemp(nug.temperature_c)}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">RAM: {fmtMem(nug.memory_used_mb,nug.memory_total_mb)} · Up: {fmtUptime(nug.uptime_seconds)}</div>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={()=>ping('nug',nug.pk_nug_id)} disabled={ps?.loading} className={cn("flex items-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-lg border transition-colors", ps?.result?.online===true?"bg-emerald-50 text-emerald-600 border-emerald-200": ps?.result?.online===false?"bg-rose-50 text-rose-500 border-rose-200":"text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700")}>
                        {ps?.loading?<RefreshCw className="w-3 h-3 animate-spin"/>:<Wifi className="w-3 h-3"/>}
                        {ps?.result ? (ps.result.online?`${ps.result.latency_ms}ms`:'Offline') : 'Ping'}
                      </button>
                      <button onClick={()=>{setConfigForm({match_threshold:Number(nug.match_threshold),conf_threshold:Number(nug.conf_threshold),cooldown_seconds:nug.cooldown_seconds,x_threshold:nug.x_threshold,tracking_window:nug.tracking_window});setConfigModal(nug);}} className="p-1.5 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800"><Settings className="w-3.5 h-3.5"/></button>
                      <button onClick={()=>{setNugForm({name:nug.name,device_code:nug.device_code,ip_address:nug.ip_address,port:String(nug.port),fk_building_id:String(nug.fk_building_id||''),fk_floor_id:String(nug.fk_floor_id||''),fk_zone_id:String(nug.fk_zone_id||'')});setNugModal({mode:'edit',data:nug});}} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><Edit2 className="w-3.5 h-3.5"/></button>
                      <button onClick={()=>del('nug-boxes',nug.pk_nug_id)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"><Trash2 className="w-3.5 h-3.5"/></button>
                      <button onClick={()=>setExpandedNugs(prev=>{const s=new Set(prev);s.has(nug.pk_nug_id)?s.delete(nug.pk_nug_id):s.add(nug.pk_nug_id);return s;})} className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                        {expanded?<ChevronDown className="w-3.5 h-3.5"/>:<ChevronRight className="w-3.5 h-3.5"/>}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Cameras */}
                {expanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {nugCams.map(cam=>{
                      const cps = pingStatus[cam.pk_camera_id];
                      return (
                        <div key={cam.pk_camera_id} className="flex items-center gap-3 px-5 py-3 border-b border-slate-50 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", cam.status==='online'?"bg-emerald-100 dark:bg-emerald-900/20":"bg-slate-100 dark:bg-slate-800")}>
                            <Camera className={cn("w-4 h-4", cam.status==='online'?"text-emerald-600":"text-slate-400")}/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{cam.name}</span>
                              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", cam.status==='online'?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-500")}>{cam.status?.toUpperCase()}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                              <span className="font-mono">{cam.ip_address}</span>
                              <span>{cam.cam_id}</span>
                              <span className="text-emerald-600 font-semibold">{cam.recognition_accuracy}% acc</span>
                              <span>{cam.total_scans?.toLocaleString()} scans</span>
                              {cam.zone_name && <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/>{cam.zone_name}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={()=>ping('camera',cam.pk_camera_id)} disabled={cps?.loading} className={cn("flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border transition-colors", cps?.result?.online===true?"bg-emerald-50 text-emerald-600 border-emerald-200":cps?.result?.online===false?"bg-rose-50 text-rose-500 border-rose-200":"text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700")}>
                              {cps?.loading?<RefreshCw className="w-3 h-3 animate-spin"/>:<Wifi className="w-3 h-3"/>}
                              {cps?.result?(cps.result.online?'Online':'Offline'):'Ping'}
                            </button>
                            <button onClick={()=>{setCameraForm({name:cam.name,cam_id:cam.cam_id,rtsp_url:cam.rtsp_url||'',ip_address:cam.ip_address||'',model:cam.model||'',fk_nug_id:cam.fk_nug_id,fk_floor_id:String(cam.fk_floor_id||''),fk_zone_id:String(cam.fk_zone_id||'')});setCameraModal({mode:'edit',data:cam});}} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><Edit2 className="w-3.5 h-3.5"/></button>
                            <button onClick={()=>del('cameras',cam.pk_camera_id)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"><Trash2 className="w-3.5 h-3.5"/></button>
                          </div>
                        </div>
                      );
                    })}
                    {/* Add camera button */}
                    <button onClick={()=>{setCameraForm({name:'',cam_id:'',rtsp_url:'',ip_address:'',model:'',fk_nug_id:nug.pk_nug_id,fk_floor_id:activeFloor?.pk_floor_id||'',fk_zone_id:''});setCameraModal({mode:'add',nugId:nug.pk_nug_id});}} className="flex items-center gap-2 w-full px-5 py-3 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors">
                      <Plus className="w-3.5 h-3.5"/> Add Camera to this NUG Box
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Empty state */}
          {floorNugs.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Cpu className="w-12 h-12 mx-auto mb-3 opacity-30"/>
              <p className="font-medium">No NUG boxes on this floor</p>
              <p className="text-xs mt-1">Add a NUG Box to get started</p>
            </div>
          )}
        </div>
      )}

      {/* ── MAP VIEW ── */}
      {viewMode === 'map' && activeFloor && (
        <FloorMap
          floor={activeFloor}
          nugs={floorNugs}
          cameras={floorCams}
          onSavePosition={savePosition}
          onSaveFloorPlan={saveFloorPlan}
        />
      )}

      {/* ── BUILDING MODAL ── */}
      {buildingModal && (
        <Modal title={buildingModal.mode==='add'?'Add Building':'Edit Building'} onClose={()=>setBuildingModal(null)}>
          <div className="space-y-3">
            <Field label="Building Name *"><input value={buildingForm.name} onChange={e=>setBuildingForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Block A" className={input}/></Field>
            <Field label="Address"><input value={buildingForm.address} onChange={e=>setBuildingForm(f=>({...f,address:e.target.value}))} placeholder="e.g. Hyderabad, India" className={input}/></Field>
            <div className="flex gap-2 pt-2">
              <button onClick={savBuilding} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"><Save className="w-4 h-4"/>Save</button>
              <button onClick={()=>setBuildingModal(null)} className="px-4 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── FLOOR MODAL ── */}
      {floorModal && (
        <Modal title={floorModal.mode==='add'?'Add Floor':'Edit Floor'} onClose={()=>setFloorModal(null)}>
          <div className="space-y-3">
            <Field label="Floor Number *"><input type="number" value={floorForm.floor_number} onChange={e=>setFloorForm(f=>({...f,floor_number:e.target.value}))} placeholder="7" className={input}/></Field>
            <Field label="Floor Name"><input value={floorForm.floor_name} onChange={e=>setFloorForm(f=>({...f,floor_name:e.target.value}))} placeholder="e.g. Floor 7" className={input}/></Field>
            <div className="flex gap-2 pt-2">
              <button onClick={savFloor} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"><Save className="w-4 h-4"/>Save</button>
              <button onClick={()=>setFloorModal(null)} className="px-4 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── NUG BOX MODAL ── */}
      {nugModal && (
        <Modal title={nugModal.mode==='add'?'Add NUG Box':'Edit NUG Box'} onClose={()=>setNugModal(null)} wide>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Name *"><input value={nugForm.name} onChange={e=>setNugForm(f=>({...f,name:e.target.value}))} placeholder="Jetson Orin NX - Floor 7" className={input}/></Field></div>
            <Field label="Device Code"><input value={nugForm.device_code} onChange={e=>setNugForm(f=>({...f,device_code:e.target.value}))} placeholder="jetson-floor-7" className={input}/></Field>
            <Field label="IP Address *"><input value={nugForm.ip_address} onChange={e=>setNugForm(f=>({...f,ip_address:e.target.value}))} placeholder="172.18.3.202" className={input}/></Field>
            <Field label="Port"><input type="number" value={nugForm.port} onChange={e=>setNugForm(f=>({...f,port:e.target.value}))} className={input}/></Field>
            <Field label="Floor">
              <select value={nugForm.fk_floor_id} onChange={e=>setNugForm(f=>({...f,fk_floor_id:e.target.value}))} className={input}>
                <option value="">Select floor...</option>
                {hierarchy.floors.map(f=><option key={f.pk_floor_id} value={f.pk_floor_id}>{f.floor_name || `Floor ${f.floor_number}`}</option>)}
              </select>
            </Field>
            <div className="col-span-2 flex gap-2 pt-2">
              <button onClick={savNug} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"><Save className="w-4 h-4"/>Save</button>
              <button onClick={()=>setNugModal(null)} className="px-4 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── CAMERA MODAL ── */}
      {cameraModal && (
        <Modal title={cameraModal.mode==='add'?'Add Camera':'Edit Camera'} onClose={()=>setCameraModal(null)} wide>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Camera Name *"><input value={cameraForm.name} onChange={e=>setCameraForm(f=>({...f,name:e.target.value}))} placeholder="Main Entrance Camera" className={input}/></Field></div>
            <Field label="Camera ID *"><input value={cameraForm.cam_id} onChange={e=>setCameraForm(f=>({...f,cam_id:e.target.value}))} placeholder="entrance-cam-01" className={input}/></Field>
            <Field label="IP Address"><input value={cameraForm.ip_address} onChange={e=>setCameraForm(f=>({...f,ip_address:e.target.value}))} placeholder="172.18.3.201" className={input}/></Field>
            <div className="col-span-2"><Field label="RTSP URL"><input value={cameraForm.rtsp_url} onChange={e=>setCameraForm(f=>({...f,rtsp_url:e.target.value}))} placeholder="rtsp://admin:pass@ip/h264" className={input}/></Field></div>
            <Field label="Model"><input value={cameraForm.model} onChange={e=>setCameraForm(f=>({...f,model:e.target.value}))} placeholder="Prama IP Camera" className={input}/></Field>
            <Field label="NUG Box">
              <select value={cameraForm.fk_nug_id} onChange={e=>setCameraForm(f=>({...f,fk_nug_id:e.target.value}))} className={input}>
                <option value="">Select NUG Box...</option>
                {hierarchy.nug_boxes.map(n=><option key={n.pk_nug_id} value={n.pk_nug_id}>{n.name}</option>)}
              </select>
            </Field>
            <div className="col-span-2 flex gap-2 pt-2">
              <button onClick={savCamera} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"><Save className="w-4 h-4"/>Save</button>
              <button onClick={()=>setCameraModal(null)} className="px-4 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── CONFIG MODAL ── */}
      {configModal && (
        <Modal title={`Configure: ${configModal.name}`} onClose={()=>setConfigModal(null)} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Match Threshold</label>
                <div className="flex items-center gap-3 mt-2">
                  <input type="range" min="0.1" max="0.9" step="0.01" value={configForm.match_threshold} onChange={e=>setConfigForm(f=>({...f,match_threshold:Number(e.target.value)}))} className="flex-1"/>
                  <span className="text-sm font-bold text-blue-600 w-12 text-right">{configForm.match_threshold.toFixed(2)}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Lower = more matches, higher = more precise</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Confidence Threshold</label>
                <div className="flex items-center gap-3 mt-2">
                  <input type="range" min="0.1" max="0.9" step="0.01" value={configForm.conf_threshold} onChange={e=>setConfigForm(f=>({...f,conf_threshold:Number(e.target.value)}))} className="flex-1"/>
                  <span className="text-sm font-bold text-blue-600 w-12 text-right">{configForm.conf_threshold.toFixed(2)}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Min face detection confidence</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Cooldown (seconds)</label>
                <div className="flex items-center gap-3 mt-2">
                  <input type="range" min="1" max="60" step="1" value={configForm.cooldown_seconds} onChange={e=>setConfigForm(f=>({...f,cooldown_seconds:Number(e.target.value)}))} className="flex-1"/>
                  <span className="text-sm font-bold text-blue-600 w-12 text-right">{configForm.cooldown_seconds}s</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">X Threshold (px)</label>
                <div className="flex items-center gap-3 mt-2">
                  <input type="range" min="5" max="100" step="5" value={configForm.x_threshold} onChange={e=>setConfigForm(f=>({...f,x_threshold:Number(e.target.value)}))} className="flex-1"/>
                  <span className="text-sm font-bold text-blue-600 w-12 text-right">{configForm.x_threshold}px</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Tracking Window</label>
                <div className="flex items-center gap-3 mt-2">
                  <input type="range" min="2" max="12" step="1" value={configForm.tracking_window} onChange={e=>setConfigForm(f=>({...f,tracking_window:Number(e.target.value)}))} className="flex-1"/>
                  <span className="text-sm font-bold text-blue-600 w-12 text-right">{configForm.tracking_window}</span>
                </div>
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
              ⚠ Applying config will push changes to the NUG Box at {configModal.ip_address}:{configModal.port}. Changes take effect immediately.
            </div>
            <div className="flex gap-2">
              <button onClick={()=>applyConfig(configModal.pk_nug_id)} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"><Zap className="w-4 h-4"/>Apply to Device</button>
              <button onClick={async()=>{await apiRequest(`/devices/nug-boxes/${configModal.pk_nug_id}`,{...opts(),method:'PUT',body:JSON.stringify(configForm)});setConfigModal(null);fetchHierarchy();}} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"><Save className="w-4 h-4"/>Save Only</button>
              <button onClick={()=>setConfigModal(null)} className="px-4 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
