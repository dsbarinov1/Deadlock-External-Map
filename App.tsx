import React, { useState, useEffect, useRef } from 'react';
import { analyzeMapSnapshot, TacticalAlert } from './services/geminiService';
import MapCanvas from './components/MapCanvas';
import { PenIcon, TrashIcon, MonitorIcon, BrainIcon, CheckIcon, VolumeIcon, VolumeXIcon } from './components/IconSymbols';
import { CropRegion, DrawingPath, Marker, ToolType } from './types';

const INITIAL_CROP: CropRegion = { x: 0, y: 0, width: 300, height: 300 };

export default function App() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  // Load initial crop from local storage if available
  const [cropRegion, setCropRegion] = useState<CropRegion>(() => {
    try {
      const saved = localStorage.getItem('deadlock-map-crop');
      return saved ? JSON.parse(saved) : INITIAL_CROP;
    } catch (e) {
      return INITIAL_CROP;
    }
  });

  const [isSetupMode, setIsSetupMode] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Waiting for Deadlock...");
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [foundGameInfo, setFoundGameInfo] = useState<any>(null);
  
  // Tools state
  const [drawings, setDrawings] = useState<DrawingPath[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [activeTool, setActiveTool] = useState<ToolType>(ToolType.PEN);
  const [selectedColor, setSelectedColor] = useState<string>('#ef4444'); // Red default

  // Analysis State
  const [latestAlert, setLatestAlert] = useState<TacticalAlert | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const hasApiKey = !!process.env.API_KEY;
  
  // Canvas Ref for screenshotting
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Video element for setup mode (to determine video dimensions)
  const setupVideoRef = useRef<HTMLVideoElement>(null);
  const [videoDim, setVideoDim] = useState({ w: 1920, h: 1080 });

  // Interaction State for Resizing/Moving
  const [interaction, setInteraction] = useState<{
    type: 'idle' | 'moving' | 'resizing';
    handle?: 'nw' | 'ne' | 'sw' | 'se';
    startMouse: { x: number; y: number };
    startCrop: CropRegion;
  }>({ type: 'idle', startMouse: { x: 0, y: 0 }, startCrop: INITIAL_CROP });

  // Persist crop region changes
  useEffect(() => {
    localStorage.setItem('deadlock-map-crop', JSON.stringify(cropRegion));
  }, [cropRegion]);

  // --- OVERWOLF GAME DETECTION LOGIC ---
  useEffect(() => {
    if (typeof window.overwolf === 'undefined') {
      setStatusMessage("Not running in Overwolf. Manual selection required.");
      return;
    }

    const onGameInfoUpdated = (event: any) => {
      if (event && event.gameInfo && event.gameInfo.isRunning) {
        detectAndCapture(event.gameInfo);
      } else if (event && event.runningChanged === false) {
        setStream(null);
        setIsGameRunning(false);
        setFoundGameInfo(null);
        setStatusMessage("Game closed. Waiting...");
      }
    };

    // Listen for game launch
    window.overwolf.games.onGameInfoUpdated.addListener(onGameInfoUpdated);

    // Check if already running
    window.overwolf.games.getRunningGameInfo((res: any) => {
      if (res && res.isRunning) {
        detectAndCapture(res);
      }
    });

    return () => {
      window.overwolf.games.onGameInfoUpdated.removeListener(onGameInfoUpdated);
    };
  }, []);

  const detectAndCapture = (gameInfo: any) => {
    // 228480 is Deadlock steam ID usually, but we accept any game for now to be safe
    // If the game is running, we get the window handle
    if (!gameInfo || !gameInfo.isRunning || !gameInfo.width) return;

    setIsGameRunning(true);
    // Store the info, but DO NOT start capture yet. 
    // We need a user interaction (click) to trigger getUserMedia to avoid "Permission denied".
    setFoundGameInfo(gameInfo);
    setStatusMessage(`Ready to connect: ${gameInfo.title || "Game"}`);
  };

  const handleConnectClick = () => {
    if (foundGameInfo) {
      captureGameWindow(foundGameInfo.windowHandle, foundGameInfo.width, foundGameInfo.height);
    }
  };

  const captureGameWindow = async (windowHandle: any, width: number, height: number) => {
    if (!windowHandle) {
      setStatusMessage("Game found, but Window Handle is missing.");
      return;
    }

    try {
      setStatusMessage(`Hooking into window: ${windowHandle}...`);

      // Overwolf/Electron specific API to target a specific window handle
      // This prevents "stitching" of multiple screens
      const constraints = {
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: `window:${windowHandle}`,
            // Removing strict constraints to avoid "ConstraintNotSatisfiedError" if game resizes slightly
            // minWidth: width,
            // maxWidth: width,
            // minHeight: height,
            // maxHeight: height
          }
        }
      } as any;

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      setStream(mediaStream);
      setVideoDim({ w: width, h: height });
      
      // Center crop box initially
      setCropRegion({
        x: (width / 2) - 150,
        y: (height / 2) - 150,
        width: 300,
        height: 300
      });

      setStatusMessage("Stream Active");

    } catch (err) {
      console.error("Capture failed:", err);
      setStatusMessage(`Capture Error: ${err}`);
    }
  };
  
  // Fallback for manual button (dev mode or if detection fails)
  const manualCapture = async () => {
    try {
        const mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        setStream(mediaStream);
        const track = mediaStream.getVideoTracks()[0];
        const settings = track.getSettings();
        const w = settings.width || 1920;
        const h = settings.height || 1080;
        setVideoDim({ w, h });
    } catch(e) {
        console.error(e);
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

  // Sync stream to setup video element
  useEffect(() => {
    if (isSetupMode && setupVideoRef.current && stream) {
      setupVideoRef.current.srcObject = stream;
    }
  }, [isSetupMode, stream]);

  // --- Interaction Handlers (Move/Resize) ---

  const handleMouseDownBox = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setInteraction({
      type: 'moving',
      startMouse: { x: e.clientX, y: e.clientY },
      startCrop: { ...cropRegion }
    });
  };

  const handleMouseDownHandle = (handle: 'nw' | 'ne' | 'sw' | 'se') => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setInteraction({
      type: 'resizing',
      handle,
      startMouse: { x: e.clientX, y: e.clientY },
      startCrop: { ...cropRegion }
    });
  };

  // Global mouse listeners for drag
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
        newCrop.x += dx;
        newCrop.y += dy;
        newCrop.x = Math.max(0, Math.min(newCrop.x, videoDim.w - newCrop.width));
        newCrop.y = Math.max(0, Math.min(newCrop.y, videoDim.h - newCrop.height));
      } 
      else if (interaction.type === 'resizing' && interaction.handle) {
        const minSize = 50;
        if (interaction.handle.includes('e')) newCrop.width = Math.max(minSize, interaction.startCrop.width + dx);
        if (interaction.handle.includes('s')) newCrop.height = Math.max(minSize, interaction.startCrop.height + dy);
        if (interaction.handle.includes('w')) {
          const proposedWidth = interaction.startCrop.width - dx;
          if (proposedWidth >= minSize) {
            newCrop.x = interaction.startCrop.x + dx;
            newCrop.width = proposedWidth;
          }
        }
        if (interaction.handle.includes('n')) {
          const proposedHeight = interaction.startCrop.height - dy;
          if (proposedHeight >= minSize) {
            newCrop.y = interaction.startCrop.y + dy;
            newCrop.height = proposedHeight;
          }
        }
      }
      setCropRegion(newCrop);
    };

    const handleGlobalUp = () => {
      setInteraction(prev => ({ ...prev, type: 'idle' }));
    };

    if (interaction.type !== 'idle') {
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('mouseup', handleGlobalUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
    };
  }, [interaction, videoDim]);


  // 1. Initial State: Waiting for Game
  if (!stream) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-neutral-900 text-amber-500 font-mono relative p-8">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-neutral-800 to-black z-0 opacity-50"></div>
        
        <div className="z-10 flex flex-col items-center max-w-lg text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-2 tracking-widest uppercase text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">
            Deadlock Companion
            </h1>
            <p className="text-neutral-500 mb-10 text-sm uppercase tracking-widest border-b border-neutral-800 pb-2">
            Tactical Map Mirror
            </p>
            
            <div className="relative mb-8">
                {foundGameInfo ? (
                   <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center animate-bounce shadow-[0_0_25px_rgba(34,197,94,0.6)]">
                      <CheckIcon />
                   </div>
                ) : (
                  <>
                    <div className="w-20 h-20 border-4 border-amber-600 rounded-full border-t-transparent animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <MonitorIcon />
                    </div>
                  </>
                )}
            </div>

            <h2 className="text-2xl text-white font-bold mb-2">
              {foundGameInfo ? "GAME DETECTED" : (isGameRunning ? "Connecting..." : "Waiting for Game...")}
            </h2>
            <p className="text-neutral-400 font-mono text-sm mb-6">{statusMessage}</p>

            {foundGameInfo && (
              <button 
                onClick={handleConnectClick}
                className="mb-8 px-8 py-4 bg-green-600 hover:bg-green-500 text-white font-bold text-xl rounded-lg shadow-xl transition-all transform hover:scale-105 animate-pulse"
              >
                CONNECT TO DEADLOCK
              </button>
            )}

            {!foundGameInfo && (
              <div className="bg-neutral-800/80 p-4 rounded border border-neutral-700 text-left text-xs text-neutral-400 w-full">
                  <p><strong>Instructions:</strong></p>
                  <ul className="list-disc pl-4 mt-2 space-y-1">
                      <li>Launch <strong>Deadlock</strong> via Steam.</li>
                      <li>Wait for the match/sandbox to load.</li>
                      <li>This app will automatically detect the game window.</li>
                  </ul>
              </div>
            )}

            {/* Manual fallback just in case */}
            <button 
                onClick={manualCapture}
                className="mt-8 text-neutral-600 hover:text-neutral-400 text-xs underline"
            >
                Detection stuck? Click to select screen manually.
            </button>
        </div>
      </div>
    );
  }

  // 2. Setup Mode: Cropping the stream
  if (isSetupMode) {
    return (
      <div className="flex flex-col h-full w-full bg-neutral-900 text-neutral-100 select-none overflow-hidden">
        <header className="h-16 px-6 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center shrink-0 z-20">
          <div>
            <h2 className="text-xl font-bold text-amber-500">Step 2: Locate Minimap</h2>
            <p className="text-xs text-neutral-400">Drag box to cover minimap. The app is now tracking the game window.</p>
          </div>
          <div className="flex gap-4">
             <button
                onClick={() => { setStream(null); setIsGameRunning(false); setFoundGameInfo(null); }}
                className="px-4 py-2 text-neutral-400 hover:text-white text-sm"
              >
                Reset
              </button>
              <button
                onClick={() => setIsSetupMode(false)}
                className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded flex items-center gap-2 transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)]"
              >
                <CheckIcon /> Confirm Crop
              </button>
          </div>
        </header>
        
        <div className="flex-1 relative bg-black/90 flex items-center justify-center p-4 overflow-hidden">
          <div className="relative inline-block shadow-2xl border border-neutral-800">
            <video
              ref={setupVideoRef}
              autoPlay
              playsInline
              muted
              className="max-h-[calc(100vh-120px)] max-w-[calc(100vw-40px)] block object-contain"
              onLoadedMetadata={(e) => {
                setVideoDim({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight });
              }}
            />
            
            <div
              className="absolute border-2 border-amber-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] group cursor-move z-10"
              onMouseDown={handleMouseDownBox}
              style={{
                left: `${(cropRegion.x / videoDim.w) * 100}%`,
                top: `${(cropRegion.y / videoDim.h) * 100}%`,
                width: `${(cropRegion.width / videoDim.w) * 100}%`,
                height: `${(cropRegion.height / videoDim.h) * 100}%`
              }}
            >
              <div className="absolute -top-7 left-0 bg-amber-500 text-black text-xs px-2 py-0.5 font-bold pointer-events-none whitespace-nowrap rounded-t">
                MINIMAP ZONE
              </div>
              <div className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-white border border-black cursor-nwse-resize z-20" onMouseDown={handleMouseDownHandle('nw')} />
              <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white border border-black cursor-nesw-resize z-20" onMouseDown={handleMouseDownHandle('ne')} />
              <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 bg-white border border-black cursor-nesw-resize z-20" onMouseDown={handleMouseDownHandle('sw')} />
              <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-white border border-black cursor-nwse-resize z-20" onMouseDown={handleMouseDownHandle('se')} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Main Companion View
  return (
    <div className="flex h-full w-full bg-neutral-950 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-16 md:w-20 bg-neutral-900 border-r border-neutral-800 flex flex-col items-center py-4 gap-4 z-10 shrink-0">
        <div className="flex flex-col gap-3 w-full px-2">
           <div className="flex flex-wrap gap-1 justify-center mb-2">
            {['#ef4444', '#22c55e', '#eab308', '#3b82f6', '#ffffff'].map(c => (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                className={`w-5 h-5 rounded-full border-2 ${selectedColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <ToolButton active={activeTool === ToolType.PEN} onClick={() => setActiveTool(ToolType.PEN)} icon={<PenIcon />} label="Pen" />
          <ToolButton active={activeTool === ToolType.MARKER} onClick={() => setActiveTool(ToolType.MARKER)} icon={<div className="w-4 h-4 rounded-full bg-red-500 border border-white"></div>} label="Ping" />
          <ToolButton active={false} onClick={() => { setDrawings([]); setMarkers([]); }} icon={<TrashIcon />} label="Clear" variant="danger" />
        </div>

        <div className="mt-auto flex flex-col gap-3 w-full px-2">
           {hasApiKey && (
             <>
               <button onClick={() => setIsMuted(!isMuted)} className={`flex flex-col items-center p-2 rounded-lg transition-colors ${isMuted ? 'text-red-400' : 'text-neutral-400 hover:text-white'}`} title={isMuted ? "Unmute AI" : "Mute AI"}>
                 {isMuted ? <VolumeXIcon /> : <VolumeIcon />}
               </button>
               <button onClick={handleAnalyze} disabled={isAnalyzing} className={`flex flex-col items-center p-3 rounded-xl transition-all ${isAnalyzing ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' : 'bg-purple-900/50 text-purple-300 hover:bg-purple-800/50 hover:text-white border border-purple-700'}`}>
                {isAnalyzing ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mb-1"></div> : <BrainIcon />}
                <span className="text-[9px] mt-1 uppercase font-bold">Scan</span>
              </button>
             </>
           )}
          <div className="h-px bg-neutral-700 w-full my-1"></div>
          <button onClick={() => setIsSetupMode(true)} className="flex flex-col items-center p-2 text-neutral-500 hover:text-neutral-300 transition-colors">
            <div className="scale-75"><MonitorIcon /></div>
            <span className="text-[9px] mt-1">Adjust</span>
          </button>
        </div>
      </aside>

      {/* Main Area */}
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
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-neutral-900/95 border-l-4 border-purple-500 text-white px-6 py-4 rounded shadow-2xl backdrop-blur-md flex items-center gap-4 z-50">
             <div className="text-purple-400"><BrainIcon /></div>
             <div>
               <p className="font-bold text-xs tracking-wide uppercase text-purple-300 mb-1">AI Tactical Alert</p>
               <p className="text-lg font-medium text-white leading-tight">{latestAlert.text}</p>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}

const ToolButton = ({ active, onClick, icon, label, variant = 'default' }: any) => (
  <button
    onClick={onClick}
    className={`
      flex flex-col items-center justify-center p-2.5 rounded-xl transition-all w-full
      ${active ? 'bg-amber-600 text-white shadow-lg scale-105' : ''}
      ${!active && variant === 'default' ? 'text-neutral-400 hover:bg-neutral-800 hover:text-white' : ''}
      ${!active && variant === 'danger' ? 'text-red-400 hover:bg-red-900/30 hover:text-red-200' : ''}
    `}
  >
    <div className="mb-0.5 scale-90">{icon}</div>
    <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
  </button>
);