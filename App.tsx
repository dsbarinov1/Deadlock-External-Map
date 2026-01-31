import React, { useState, useEffect, useRef } from 'react';
import { analyzeMapSnapshot, TacticalAlert } from './services/geminiService';
import MapCanvas from './components/MapCanvas';
import { PenIcon, TrashIcon, MonitorIcon, BrainIcon, VolumeIcon, VolumeXIcon, XIcon } from './components/IconSymbols';
import { CropRegion, DrawingPath, Marker, ToolType } from './types';

const INITIAL_CROP: CropRegion = { x: 0, y: 0, width: 300, height: 300 };

export default function App() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  // Load initial crop from local storage
  const [cropRegion, setCropRegion] = useState<CropRegion>(() => {
    try {
      const saved = localStorage.getItem('deadlock-map-crop');
      return saved ? JSON.parse(saved) : INITIAL_CROP;
    } catch (e) {
      return INITIAL_CROP;
    }
  });

  const [isSetupMode, setIsSetupMode] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Initializing...");
  const [showManualButton, setShowManualButton] = useState(false);
  
  // Tools state
  const [drawings, setDrawings] = useState<DrawingPath[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [activeTool, setActiveTool] = useState<ToolType>(ToolType.PEN);
  const [selectedColor, setSelectedColor] = useState<string>('#ef4444');

  // Analysis State
  const [latestAlert, setLatestAlert] = useState<TacticalAlert | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const hasApiKey = !!process.env.API_KEY;
  
  // Canvas Ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Video element for setup
  const setupVideoRef = useRef<HTMLVideoElement>(null);
  const [videoDim, setVideoDim] = useState({ w: 1920, h: 1080 });

  // Interaction State
  const [interaction, setInteraction] = useState<{
    type: 'idle' | 'moving' | 'resizing';
    handle?: 'nw' | 'ne' | 'sw' | 'se';
    startMouse: { x: number; y: number };
    startCrop: CropRegion;
  }>({ type: 'idle', startMouse: { x: 0, y: 0 }, startCrop: INITIAL_CROP });

  // Overwolf Window Object
  const [currentWindow, setCurrentWindow] = useState<any>(null);

  useEffect(() => {
    localStorage.setItem('deadlock-map-crop', JSON.stringify(cropRegion));
  }, [cropRegion]);

  // --- 1. WINDOW MANAGEMENT & SECOND MONITOR LOGIC ---
  useEffect(() => {
    if (typeof window.overwolf !== 'undefined') {
      window.overwolf.windows.getCurrentWindow((result: any) => {
        if (result.status === 'success') {
          const win = result.window;
          setCurrentWindow(win);
          
          // Delay move slightly to ensure Overwolf is ready
          setTimeout(() => moveToSecondMonitor(win.id), 500);
        }
      });
    }
  }, []);

  const moveToSecondMonitor = (windowId: string) => {
    window.overwolf.utils.getMonitorsList((res: any) => {
      // Logic: Find a monitor that is NOT the primary one.
      if (res.monitors && res.monitors.length > 0) {
        const monitors = res.monitors;
        // Try to find secondary, otherwise fallback to index 1, otherwise stay on primary
        const targetMonitor = monitors.find((m: any) => !m.isPrimary) || (monitors.length > 1 ? monitors[1] : null);

        if (targetMonitor) {
          console.log("Found secondary monitor:", targetMonitor);
          const winWidth = 1200;
          const winHeight = 800;
          const x = targetMonitor.x + (targetMonitor.width / 2) - (winWidth / 2);
          const y = targetMonitor.y + (targetMonitor.height / 2) - (winHeight / 2);
          
          window.overwolf.windows.changePosition(windowId, Math.floor(x), Math.floor(y));
          // Maximize after moving for better experience? Optional.
          // window.overwolf.windows.maximize(windowId);
        }
      }
    });
  };

  const dragMove = () => {
    if (currentWindow) {
      window.overwolf.windows.dragMove(currentWindow.id);
    }
  };

  const closeWindow = () => {
    if (currentWindow) {
      window.overwolf.windows.close(currentWindow.id);
    }
  };

  const minimizeWindow = () => {
    if (currentWindow) {
        window.overwolf.windows.minimize(currentWindow.id);
    }
  }

  // --- 2. GAME DETECTION & AUTO CAPTURE ---
  useEffect(() => {
    if (typeof window.overwolf === 'undefined') {
      setStatusMessage("Not running in Overwolf.");
      setShowManualButton(true);
      return;
    }

    const onGameInfoUpdated = (event: any) => {
      if (event && event.gameInfo && event.gameInfo.isRunning) {
         setStatusMessage("Game detected...");
         setTimeout(() => detectAndCapture(event.gameInfo), 1000);
      } else if (event && event.runningChanged === false) {
        setStream(null);
        setStatusMessage("Game closed.");
      }
    };

    window.overwolf.games.onGameInfoUpdated.addListener(onGameInfoUpdated);
    
    // Check initially
    window.overwolf.games.getRunningGameInfo((res: any) => {
      if (res && res.isRunning) {
        detectAndCapture(res);
      } else {
        setStatusMessage("Waiting for Deadlock...");
        // If we don't find the game in 3 seconds, show manual button just in case
        setTimeout(() => setShowManualButton(true), 3000);
      }
    });

    return () => {
      window.overwolf.games.onGameInfoUpdated.removeListener(onGameInfoUpdated);
    };
  }, []);

  const detectAndCapture = async (gameInfo: any) => {
    if (!gameInfo || !gameInfo.isRunning) return;

    setStatusMessage(`Found ${gameInfo.title}. Attempting Sync...`);
    
    // STRATEGY: Directly capture the MONITOR the game is on.
    // Window capture (chromeMediaSource: 'desktop', id: windowHandle) is often blocked by DRM/Anti-cheat.
    // Monitor capture (chromeMediaSource: 'desktop', id: screen:ID) is usually allowed.

    try {
      await captureGameMonitor(gameInfo);
    } catch (e) {
      console.error("Monitor capture failed", e);
      setStatusMessage("Auto-sync failed.");
      setShowManualButton(true);
    }
  };

  const captureGameMonitor = async (gameInfo: any) => {
    return new Promise<void>((resolve, reject) => {
      window.overwolf.utils.getMonitorsList(async (res: any) => {
        if (!res.monitors || res.monitors.length === 0) {
            reject("No monitors found");
            return;
        }

        // 1. Determine which monitor the game is on
        const gameCenterX = (gameInfo.logicalLeft || 0) + (gameInfo.width || 1920) / 2;
        const gameCenterY = (gameInfo.logicalTop || 0) + (gameInfo.height || 1080) / 2;

        const monitor = res.monitors.find((m: any) => 
            gameCenterX >= m.x && 
            gameCenterX <= (m.x + m.width) &&
            gameCenterY >= m.y &&
            gameCenterY <= (m.y + m.height)
        ) || res.monitors[0];

        // 2. Request Media Stream for that Monitor
        try {
            const constraints = {
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: `screen:${monitor.id}`
                    }
                }
            } as any;

            const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            handleStreamSuccess(mediaStream, monitor.width, monitor.height);
            resolve();
        } catch (e) {
            reject(e);
        }
      });
    });
  };

  const handleStreamSuccess = (mediaStream: MediaStream, width: number, height: number) => {
      setStream(mediaStream);
      setVideoDim({ w: width || 1920, h: height || 1080 });
      
      // Default crop: Center of screen
      setCropRegion({
        x: (width / 2) - 150,
        y: (height / 2) - 150,
        width: 300,
        height: 300
      });

      setIsSetupMode(true); 
      setStatusMessage("Active");
      setShowManualButton(false);
  };
  
  const manualCapture = async () => {
    try {
        // Standard picker as fallback
        const mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        // @ts-ignore
        const track = mediaStream.getVideoTracks()[0];
        const settings = track.getSettings();
        handleStreamSuccess(mediaStream, settings.width || 1920, settings.height || 1080);
    } catch(e) {
        console.error(e);
        setStatusMessage("Selection cancelled.");
    }
  }


  const speakAlert = (text: string) => {
    if (isMuted || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1; 
    window.speechSynthesis.speak(utterance);
  };

  const handleAnalyze = async () => {
    if (!canvasRef.current || !hasApiKey) return;
    setIsAnalyzing(true);
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const result = await analyzeMapSnapshot(dataUrl);
    
    if (result) {
      setLatestAlert(result);
      if (result.voice) speakAlert(result.voice);
      setTimeout(() => setLatestAlert(null), 5000);
    }
    setIsAnalyzing(false);
  };

  // Sync stream to setup video
  useEffect(() => {
    if (isSetupMode && setupVideoRef.current && stream) {
      setupVideoRef.current.srcObject = stream;
    }
  }, [isSetupMode, stream]);

  // --- Interaction Handlers ---
  const handleMouseDownBox = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    setInteraction({ type: 'moving', startMouse: { x: e.clientX, y: e.clientY }, startCrop: { ...cropRegion } });
  };

  const handleMouseDownHandle = (handle: 'nw' | 'ne' | 'sw' | 'se') => (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    setInteraction({ type: 'resizing', handle, startMouse: { x: e.clientX, y: e.clientY }, startCrop: { ...cropRegion } });
  };

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      if (interaction.type === 'idle' || !setupVideoRef.current) return;
      const videoRect = setupVideoRef.current.getBoundingClientRect();
      const scaleX = videoDim.w / videoRect.width;
      const scaleY = videoDim.h / videoRect.height;
      const dx = (e.clientX - interaction.startMouse.x) * scaleX;
      const dy = (e.clientY - interaction.startMouse.y) * scaleY;
      let newCrop = { ...interaction.startCrop };

      if (interaction.type === 'moving') {
        newCrop.x = Math.max(0, Math.min(newCrop.x + dx, videoDim.w - newCrop.width));
        newCrop.y = Math.max(0, Math.min(newCrop.y + dy, videoDim.h - newCrop.height));
      } else if (interaction.type === 'resizing' && interaction.handle) {
         const minSize = 50;
         if (interaction.handle.includes('e')) newCrop.width = Math.max(minSize, interaction.startCrop.width + dx);
         if (interaction.handle.includes('s')) newCrop.height = Math.max(minSize, interaction.startCrop.height + dy);
         if (interaction.handle.includes('w')) {
           const proposedWidth = interaction.startCrop.width - dx;
           if (proposedWidth >= minSize) { newCrop.x = interaction.startCrop.x + dx; newCrop.width = proposedWidth; }
         }
         if (interaction.handle.includes('n')) {
           const proposedHeight = interaction.startCrop.height - dy;
           if (proposedHeight >= minSize) { newCrop.y = interaction.startCrop.y + dy; newCrop.height = proposedHeight; }
         }
      }
      setCropRegion(newCrop);
    };
    const handleGlobalUp = () => setInteraction(prev => ({ ...prev, type: 'idle' }));
    if (interaction.type !== 'idle') {
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('mouseup', handleGlobalUp);
    }
    return () => { window.removeEventListener('mousemove', handleGlobalMove); window.removeEventListener('mouseup', handleGlobalUp); };
  }, [interaction, videoDim]);

  // --- RENDER COMPONENTS ---

  const WindowHeader = () => (
    <div 
      onMouseDown={dragMove}
      className="h-8 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-3 shrink-0 select-none cursor-move"
    >
        <div className="flex items-center gap-2 text-amber-500 font-bold tracking-wider text-xs">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
            DEADLOCK COMPANION
        </div>
        <div className="flex items-center gap-1">
             <button onClick={minimizeWindow} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white">
                <div className="w-3 h-0.5 bg-current translate-y-1"></div>
             </button>
             <button onClick={closeWindow} className="p-1 hover:bg-red-900/50 rounded text-neutral-400 hover:text-red-400">
                <XIcon size={14} />
             </button>
        </div>
    </div>
  );

  // 1. Initial State (Waiting / Loading)
  if (!stream) {
    return (
      <div className="flex flex-col h-full w-full bg-neutral-950 border border-neutral-800">
        <WindowHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-neutral-900 to-black z-0 opacity-50"></div>
            
            <div className="z-10 flex flex-col items-center max-w-lg text-center">
                <div className="relative mb-6">
                    <div className="w-16 h-16 border-4 border-amber-600/30 border-t-amber-500 rounded-full animate-spin" />
                </div>

                <h2 className="text-2xl text-white font-bold mb-2 tracking-tight">
                   {statusMessage.toUpperCase()}
                </h2>
                
                {/* Fallback button that is ALWAYS available if things take too long */}
                {showManualButton && (
                    <div className="mt-8 flex flex-col gap-2 items-center animate-fade-in">
                        <p className="text-neutral-500 text-xs tracking-widest uppercase mb-2">Auto-Sync taking too long?</p>
                        <button 
                            onClick={manualCapture}
                            className="px-6 py-2 border border-amber-600/50 bg-amber-900/10 hover:bg-amber-600 hover:text-white text-amber-500 text-xs font-bold uppercase tracking-widest rounded transition-all"
                        >
                            Select Screen Manually
                        </button>
                    </div>
                )}
            </div>
        </div>
      </div>
    );
  }

  // 2. Setup Mode
  if (isSetupMode) {
    return (
      <div className="flex flex-col h-full w-full bg-neutral-900 text-neutral-100 select-none overflow-hidden border border-neutral-800">
        <WindowHeader />
        <header className="h-12 px-4 bg-neutral-950/80 backdrop-blur border-b border-neutral-800 flex justify-between items-center shrink-0 z-20">
          <div className="text-sm font-medium text-amber-500">Adjust Map Zone</div>
          <div className="flex gap-2">
             <button onClick={() => { setStream(null); setStatusMessage("Resetting..."); }} className="px-3 py-1 text-neutral-500 hover:text-white text-xs">Reset</button>
             <button onClick={() => setIsSetupMode(false)} className="px-4 py-1.5 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-500 transition-colors">Confirm Crop</button>
          </div>
        </header>
        
        <div className="flex-1 relative bg-black/90 flex items-center justify-center p-4 overflow-hidden">
          <div className="relative inline-block shadow-2xl border border-neutral-800">
            <video
              ref={setupVideoRef}
              autoPlay
              playsInline
              muted
              className="max-h-[calc(100vh-140px)] max-w-[calc(100vw-40px)] block object-contain"
              onLoadedMetadata={(e) => {
                setVideoDim({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight });
              }}
            />
            
            <div
              className="absolute border border-amber-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.8)] group cursor-move z-10"
              onMouseDown={handleMouseDownBox}
              style={{
                left: `${(cropRegion.x / videoDim.w) * 100}%`,
                top: `${(cropRegion.y / videoDim.h) * 100}%`,
                width: `${(cropRegion.width / videoDim.w) * 100}%`,
                height: `${(cropRegion.height / videoDim.h) * 100}%`
              }}
            >
              <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-amber-500 cursor-nwse-resize z-20" onMouseDown={handleMouseDownHandle('nw')} />
              <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-500 cursor-nesw-resize z-20" onMouseDown={handleMouseDownHandle('ne')} />
              <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-amber-500 cursor-nesw-resize z-20" onMouseDown={handleMouseDownHandle('sw')} />
              <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-amber-500 cursor-nwse-resize z-20" onMouseDown={handleMouseDownHandle('se')} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Main View
  return (
    <div className="flex flex-col h-full w-full bg-neutral-950 font-sans overflow-hidden border border-neutral-800">
      <WindowHeader />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-14 bg-neutral-900 border-r border-neutral-800 flex flex-col items-center py-3 gap-3 z-10 shrink-0">
          <div className="flex flex-col gap-2 w-full px-1.5">
            <div className="flex flex-wrap gap-1 justify-center mb-2 px-1">
                {['#ef4444', '#22c55e', '#eab308', '#3b82f6', '#ffffff'].map(c => (
                <button key={c} onClick={() => setSelectedColor(c)} className={`w-4 h-4 rounded-full border ${selectedColor === c ? 'border-white scale-125' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                ))}
            </div>
            <ToolButton active={activeTool === ToolType.PEN} onClick={() => setActiveTool(ToolType.PEN)} icon={<PenIcon />} />
            <ToolButton active={activeTool === ToolType.MARKER} onClick={() => setActiveTool(ToolType.MARKER)} icon={<div className="w-3 h-3 rounded-full bg-red-500 border border-white"></div>} />
            <ToolButton active={false} onClick={() => { setDrawings([]); setMarkers([]); }} icon={<TrashIcon />} variant="danger" />
          </div>

          <div className="mt-auto flex flex-col gap-2 w-full px-1.5">
            {hasApiKey && (
                <>
                <button onClick={() => setIsMuted(!isMuted)} className={`p-2 rounded hover:bg-neutral-800 ${isMuted ? 'text-red-400' : 'text-neutral-400'}`}>
                    {isMuted ? <VolumeXIcon /> : <VolumeIcon />}
                </button>
                <button onClick={handleAnalyze} disabled={isAnalyzing} className={`p-2 rounded transition-colors ${isAnalyzing ? 'bg-neutral-800 text-neutral-500' : 'bg-purple-900/40 text-purple-300 hover:bg-purple-800/60'}`}>
                    {isAnalyzing ? <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" /> : <BrainIcon />}
                </button>
                </>
            )}
            <div className="h-px bg-neutral-800 w-full my-1"></div>
            <button onClick={() => setIsSetupMode(true)} className="p-2 text-neutral-500 hover:text-white">
                <MonitorIcon />
            </button>
          </div>
        </aside>

        <main className="flex-1 relative bg-black overflow-hidden flex flex-col">
          <MapCanvas
            videoStream={stream}
            cropRegion={cropRegion}
            drawings={drawings}
            setDrawings={setDrawings}
            markers={markers}
            setMarkers={setMarkers}
            activeTool={activeTool}
            selectedColor={selectedColor}
            onCanvasRef={(ref) => canvasRef.current = ref}
          />
          {latestAlert && latestAlert.text && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-neutral-900/95 border border-purple-500/50 text-white px-4 py-3 rounded shadow-2xl backdrop-blur-md flex items-center gap-3 z-50 max-w-[90%]">
              <div className="text-purple-400 shrink-0"><BrainIcon /></div>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight truncate">{latestAlert.text}</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const ToolButton = ({ active, onClick, icon, variant = 'default' }: any) => (
  <button
    onClick={onClick}
    className={`
      flex items-center justify-center p-2 rounded-lg transition-all w-full h-10
      ${active ? 'bg-amber-600 text-white shadow' : ''}
      ${!active && variant === 'default' ? 'text-neutral-400 hover:bg-neutral-800 hover:text-white' : ''}
      ${!active && variant === 'danger' ? 'text-neutral-600 hover:bg-red-900/20 hover:text-red-400' : ''}
    `}
  >
    {icon}
  </button>
);