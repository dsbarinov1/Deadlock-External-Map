
import React, { useState, useEffect, useRef } from 'react';
import { analyzeMapSnapshot, TacticalAlert } from '../services/geminiService';
import MapCanvas from '../components/MapCanvas';
import { PenIcon, TrashIcon, MonitorIcon, BrainIcon, VolumeIcon, VolumeXIcon, XIcon } from '../components/IconSymbols';
import { CropRegion, DrawingPath, Marker, ToolType } from '../types';
import { kWindowNames } from '../consts';
import { OWWindow } from '../lib/overwolf';

const INITIAL_CROP: CropRegion = { x: 0, y: 0, width: 300, height: 300 };

const DesktopWindow = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cropRegion, setCropRegion] = useState<CropRegion>(() => {
    try { return JSON.parse(localStorage.getItem('deadlock-map-crop') || 'null') || INITIAL_CROP; } 
    catch { return INITIAL_CROP; }
  });

  const [isSetupMode, setIsSetupMode] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Ready");
  
  // Tools
  const [drawings, setDrawings] = useState<DrawingPath[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [activeTool, setActiveTool] = useState<ToolType>(ToolType.PEN);
  const [selectedColor, setSelectedColor] = useState<string>('#ef4444');

  // AI
  const [latestAlert, setLatestAlert] = useState<TacticalAlert | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const hasApiKey = !!process.env.API_KEY;
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const setupVideoRef = useRef<HTMLVideoElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [videoDim, setVideoDim] = useState({ w: 1920, h: 1080 });

  // Window Instance
  const windowInstance = useRef(new OWWindow(kWindowNames.desktop));

  // Interaction State
  const [interaction, setInteraction] = useState<{
    type: 'idle' | 'moving' | 'resizing';
    handle?: 'nw' | 'ne' | 'sw' | 'se';
    startMouse: { x: number; y: number };
    startCrop: CropRegion;
  }>({ type: 'idle', startMouse: { x: 0, y: 0 }, startCrop: INITIAL_CROP });

  useEffect(() => { localStorage.setItem('deadlock-map-crop', JSON.stringify(cropRegion)); }, [cropRegion]);

  // Init Window Drag
  useEffect(() => {
      if (headerRef.current) {
          windowInstance.current.dragMove(headerRef.current);
      }
  }, []);

  // Init - Try to auto-detect
  useEffect(() => {
    if (typeof window.overwolf === 'undefined') return;

    const autoConnect = async () => {
        const gameInfo = await new Promise<any>(r => overwolf.games.getRunningGameInfo(r));
        if (gameInfo && gameInfo.isRunning && Math.floor(gameInfo.id / 10) === 2420) { 
             setStatusMessage("Deadlock Detected");
             detectAndCapture(gameInfo);
        } else {
             setStatusMessage("Game Not Detected (Use Manual)");
        }
    }
    autoConnect();
  }, []);

  const detectAndCapture = async (gameInfo: any) => {
    setStatusMessage("Syncing...");
    
    window.overwolf.utils.getMonitorsList(async (res: any) => {
        if (!res.monitors || res.monitors.length === 0) return;

        const cx = (gameInfo.logicalLeft || 0) + (gameInfo.width || 1920)/2;
        const cy = (gameInfo.logicalTop || 0) + (gameInfo.height || 1080)/2;
        const monitor = res.monitors.find((m: any) => cx >= m.x && cx <= m.x+m.width && cy >= m.y && cy <= m.y+m.height) || res.monitors[0];

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: `screen:${monitor.id}`
                    }
                }
            } as any);

            setStream(stream);
            setVideoDim({ w: monitor.width, h: monitor.height });
            setIsSetupMode(true);
            setStatusMessage("Active");
        } catch (e) {
            console.error(e);
            setStatusMessage("Auto-Sync Failed");
        }
    });
  };

  const manualCapture = async () => {
    try {
        const ms = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        // @ts-ignore
        const s = ms.getVideoTracks()[0].getSettings();
        setStream(ms);
        setVideoDim({ w: s.width || 1920, h: s.height || 1080 });
        setIsSetupMode(true);
    } catch(e) { 
        setStatusMessage("Selection Cancelled"); 
    }
  }

  const handleAnalyze = async () => {
    if (!canvasRef.current || !hasApiKey) return;
    setIsAnalyzing(true);
    const result = await analyzeMapSnapshot(canvasRef.current.toDataURL('image/png'));
    if (result) {
      setLatestAlert(result);
      if (result.voice && !isMuted) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(result.voice);
          u.rate = 1.1;
          window.speechSynthesis.speak(u);
      }
      setTimeout(() => setLatestAlert(null), 5000);
    }
    setIsAnalyzing(false);
  };

  useEffect(() => {
    if (isSetupMode && setupVideoRef.current && stream) setupVideoRef.current.srcObject = stream;
  }, [isSetupMode, stream]);

  // Interaction Logic
  const handleBoxDown = (e: React.MouseEvent) => { e.preventDefault(); setInteraction({type: 'moving', startMouse: {x:e.clientX, y:e.clientY}, startCrop: {...cropRegion}}); };
  const handleHandleDown = (h: any) => (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setInteraction({type: 'resizing', handle: h, startMouse: {x:e.clientX, y:e.clientY}, startCrop: {...cropRegion}}); };
  
  useEffect(() => {
      const move = (e: MouseEvent) => {
          if (interaction.type === 'idle' || !setupVideoRef.current) return;
          const r = setupVideoRef.current.getBoundingClientRect();
          const sx = videoDim.w / r.width;
          const sy = videoDim.h / r.height;
          const dx = (e.clientX - interaction.startMouse.x) * sx;
          const dy = (e.clientY - interaction.startMouse.y) * sy;
          let c = { ...interaction.startCrop };
          
          if (interaction.type === 'moving') {
             c.x = Math.max(0, Math.min(c.x + dx, videoDim.w - c.width));
             c.y = Math.max(0, Math.min(c.y + dy, videoDim.h - c.height));
          } else if (interaction.type === 'resizing' && interaction.handle) {
             const min = 50;
             if (interaction.handle.includes('e')) c.width = Math.max(min, interaction.startCrop.width + dx);
             if (interaction.handle.includes('s')) c.height = Math.max(min, interaction.startCrop.height + dy);
             if (interaction.handle.includes('w')) {
                 const w = interaction.startCrop.width - dx;
                 if (w>=min) { c.x = interaction.startCrop.x + dx; c.width = w; }
             }
             if (interaction.handle.includes('n')) {
                 const h = interaction.startCrop.height - dy;
                 if (h>=min) { c.y = interaction.startCrop.y + dy; c.height = h; }
             }
          }
          setCropRegion(c);
      };
      const up = () => setInteraction(p => ({...p, type: 'idle'}));
      if (interaction.type !== 'idle') { window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }
      return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [interaction, videoDim]);

  const Header = () => (
    <div ref={headerRef} className="h-8 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-3 shrink-0 select-none cursor-move">
        <div className="flex items-center gap-2 text-amber-500 font-bold tracking-wider text-xs">DEADLOCK COMPANION</div>
        <div className="flex items-center gap-1">
             <button onMouseDown={e => e.stopPropagation()} onClick={() => windowInstance.current.minimize()} className="p-1 hover:bg-neutral-800 rounded text-neutral-400"><div className="w-3 h-0.5 bg-current translate-y-1"></div></button>
             <button onMouseDown={e => e.stopPropagation()} onClick={() => windowInstance.current.close()} className="p-1 hover:bg-red-900/50 rounded text-neutral-400 hover:text-red-400"><XIcon size={14} /></button>
        </div>
    </div>
  );

  if (!stream) {
      return (
          <div className="flex flex-col h-full w-full bg-neutral-950 border border-neutral-800">
              <Header />
              <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
                  <div className="text-amber-500 mb-4"><MonitorIcon /></div>
                  <h2 className="text-xl text-white font-bold mb-2">{statusMessage.toUpperCase()}</h2>
                  <p className="text-neutral-500 text-xs text-center mb-6 max-w-[200px]">
                      If auto-detect fails, select the game screen manually.
                  </p>
                  <button onClick={manualCapture} className="px-6 py-3 border border-amber-600/50 bg-amber-900/20 hover:bg-amber-600 text-amber-500 hover:text-white text-sm font-bold uppercase rounded transition-colors shadow-lg">
                      Select Screen Manually
                  </button>
              </div>
          </div>
      );
  }

  if (isSetupMode) {
      return (
          <div className="flex flex-col h-full w-full bg-neutral-900 text-neutral-100 border border-neutral-800">
             <Header />
             <header className="h-12 px-4 bg-neutral-950/80 border-b border-neutral-800 flex justify-between items-center shrink-0 z-20">
                 <span className="text-sm font-medium text-amber-500">Adjust Zone</span>
                 <div className="flex gap-2">
                     <button onClick={() => setStream(null)} className="px-3 py-1 text-xs text-neutral-500 hover:text-white">Reset</button>
                     <button onClick={() => setIsSetupMode(false)} className="px-4 py-1.5 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-500">Confirm</button>
                 </div>
             </header>
             <div className="flex-1 relative bg-black/90 flex items-center justify-center p-4 overflow-hidden">
                 <div className="relative border border-neutral-800 shadow-2xl">
                     <video ref={setupVideoRef} autoPlay muted className="max-h-[calc(100vh-140px)] max-w-[calc(100vw-40px)] block" />
                     <div onMouseDown={handleBoxDown} className="absolute border border-amber-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.8)] cursor-move z-10"
                        style={{left: `${(cropRegion.x/videoDim.w)*100}%`, top: `${(cropRegion.y/videoDim.h)*100}%`, width: `${(cropRegion.width/videoDim.w)*100}%`, height: `${(cropRegion.height/videoDim.h)*100}%`}}>
                        {['nw','ne','sw','se'].map((h: any) => (
                            <div key={h} onMouseDown={handleHandleDown(h)} className={`absolute w-3 h-3 bg-amber-500 z-20 cursor-${h==='nw'||h==='se'?'nwse':'nesw'}-resize`} 
                                style={{top: h[0]==='n'?'-6px':'auto', bottom: h[0]==='s'?'-6px':'auto', left: h[1]==='w'?'-6px':'auto', right: h[1]==='e'?'-6px':'auto'}} />
                        ))}
                     </div>
                 </div>
             </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full w-full bg-neutral-950 font-sans border border-neutral-800">
        <Header />
        <div className="flex flex-1 overflow-hidden">
            <aside className="w-14 bg-neutral-900 border-r border-neutral-800 flex flex-col items-center py-3 gap-3 shrink-0 z-10">
                <div className="flex flex-wrap gap-1 justify-center px-1 mb-2">
                    {['#ef4444', '#22c55e', '#eab308', '#3b82f6', '#ffffff'].map(c => (
                        <button key={c} onClick={() => setSelectedColor(c)} className={`w-4 h-4 rounded-full border ${selectedColor===c?'border-white scale-125':'border-transparent'}`} style={{backgroundColor:c}}/>
                    ))}
                </div>
                <ToolButton active={activeTool===ToolType.PEN} onClick={() => setActiveTool(ToolType.PEN)} icon={<PenIcon/>}/>
                <ToolButton active={activeTool===ToolType.MARKER} onClick={() => setActiveTool(ToolType.MARKER)} icon={<div className="w-3 h-3 rounded-full bg-red-500 border border-white"/>}/>
                <ToolButton onClick={() => {setDrawings([]); setMarkers([]);}} icon={<TrashIcon/>} variant="danger"/>
                
                <div className="mt-auto flex flex-col gap-2 w-full px-1.5">
                    {hasApiKey && (
                        <>
                            <button onClick={() => setIsMuted(!isMuted)} className={`p-2 rounded hover:bg-neutral-800 ${isMuted?'text-red-400':'text-neutral-400'}`}>{isMuted?<VolumeXIcon/>:<VolumeIcon/>}</button>
                            <button onClick={handleAnalyze} disabled={isAnalyzing} className={`p-2 rounded ${isAnalyzing?'bg-neutral-800 text-neutral-500':'bg-purple-900/40 text-purple-300 hover:bg-purple-800/60'}`}>{isAnalyzing?<div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"/>:<BrainIcon/>}</button>
                        </>
                    )}
                    <div className="h-px bg-neutral-800 w-full my-1"/>
                    <button onClick={() => setIsSetupMode(true)} className="p-2 text-neutral-500 hover:text-white"><MonitorIcon/></button>
                </div>
            </aside>
            <main className="flex-1 relative bg-black overflow-hidden flex flex-col">
                <MapCanvas videoStream={stream} cropRegion={cropRegion} drawings={drawings} setDrawings={setDrawings} markers={markers} setMarkers={setMarkers} activeTool={activeTool} selectedColor={selectedColor} onCanvasRef={r => canvasRef.current=r} />
                {latestAlert && latestAlert.text && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-neutral-900/95 border border-purple-500/50 text-white px-4 py-3 rounded shadow-2xl backdrop-blur-md flex items-center gap-3 z-50">
                        <div className="text-purple-400"><BrainIcon/></div>
                        <p className="text-sm font-medium">{latestAlert.text}</p>
                    </div>
                )}
            </main>
        </div>
    </div>
  );
};

const ToolButton = ({active, onClick, icon, variant='default'}:any) => (
    <button onClick={onClick} className={`flex items-center justify-center p-2 rounded-lg w-full h-10 transition-all ${active?'bg-amber-600 text-white shadow':''} ${!active&&variant==='default'?'text-neutral-400 hover:bg-neutral-800 hover:text-white':''} ${!active&&variant==='danger'?'text-neutral-600 hover:bg-red-900/20 hover:text-red-400':''}`}>{icon}</button>
);

export default DesktopWindow;
