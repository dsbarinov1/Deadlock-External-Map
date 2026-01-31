import React, { useState, useEffect, useRef } from 'react';
import { analyzeMapSnapshot, TacticalAlert } from './services/geminiService';
import MapCanvas from './components/MapCanvas';
import { PenIcon, EraserIcon, TrashIcon, MonitorIcon, BrainIcon, CheckIcon, XIcon, VolumeIcon, VolumeXIcon } from './components/IconSymbols';
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
  
  // Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  
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

  // Handle PWA Install Prompt
  useEffect(() => {
    // Check if already in standalone mode
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsStandalone(isStandaloneMode);

    // Check if the event was already captured globally in index.html
    if ((window as any).deferredInstallPrompt) {
        setDeferredPrompt((window as any).deferredInstallPrompt);
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      (window as any).deferredInstallPrompt = e;
      console.log("Install prompt captured in React");
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        (window as any).deferredInstallPrompt = null;
      }
    } else {
      // If no prompt is available, show the help modal
      setShowInstallHelp(true);
    }
  };

  const startScreenCapture = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
      setStream(mediaStream);
      
      const track = mediaStream.getVideoTracks()[0];
      const settings = track.getSettings();
      if (settings.width && settings.height) {
        setVideoDim({ w: settings.width, h: settings.height });
      }
    } catch (err) {
      console.error("Error capturing screen:", err);
      alert(`Could not capture screen. Please ensure permissions are granted. Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleStopCapture = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsSetupMode(true);
    }
  };

  const speakAlert = (text: string) => {
    if (isMuted || !text) return;
    // Cancel previous speech to prioritize new alert
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1; // Slightly faster for urgent feel
    window.speechSynthesis.speak(utterance);
  };

  const handleAnalyze = async () => {
    if (!canvasRef.current || !hasApiKey) return;
    setIsAnalyzing(true);
    
    // Get image from canvas
    const dataUrl = canvasRef.current.toDataURL('image/png');
    
    const result = await analyzeMapSnapshot(dataUrl);
    
    if (result) {
      setLatestAlert(result);
      if (result.voice) {
        speakAlert(result.voice);
      }
      
      // Auto-hide visual alert after 5 seconds
      setTimeout(() => {
        setLatestAlert(null);
      }, 5000);
    }
    
    setIsAnalyzing(false);
  };

  // If stream ends externally
  useEffect(() => {
    if (stream) {
      stream.getVideoTracks()[0].onended = () => {
        setStream(null);
        setIsSetupMode(true);
      };
    }
  }, [stream]);

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
        
        // Clamp to bounds
        newCrop.x = Math.max(0, Math.min(newCrop.x, videoDim.w - newCrop.width));
        newCrop.y = Math.max(0, Math.min(newCrop.y, videoDim.h - newCrop.height));
      } 
      else if (interaction.type === 'resizing' && interaction.handle) {
        const minSize = 50;

        if (interaction.handle.includes('e')) {
          newCrop.width = Math.max(minSize, interaction.startCrop.width + dx);
        }
        if (interaction.handle.includes('s')) {
          newCrop.height = Math.max(minSize, interaction.startCrop.height + dy);
        }
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


  // Setup View Render
  if (!stream) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-neutral-900 text-amber-500 font-mono relative">
        <h1 className="text-4xl font-bold mb-4 tracking-widest uppercase text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">
          Deadlock Map Companion
        </h1>
        <p className="text-neutral-400 mb-8 max-w-md text-center">
          Duplicate your minimap to a second screen. Draw tactical plans.
        </p>
        <div className="flex gap-4">
          <button
            onClick={startScreenCapture}
            className="flex items-center gap-3 px-8 py-4 bg-amber-600 hover:bg-amber-500 text-black font-bold text-lg rounded shadow-lg transition-all transform hover:scale-105"
          >
            <MonitorIcon />
            Select Game Screen
          </button>
          
          {!isStandalone && (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-3 px-8 py-4 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-lg rounded shadow-lg border border-neutral-600 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              Install App
            </button>
          )}
        </div>

        {/* Installation Help Modal */}
        {showInstallHelp && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowInstallHelp(false)}>
                <div className="bg-neutral-900 border border-amber-500/50 rounded-2xl p-8 max-w-lg shadow-2xl relative" onClick={e => e.stopPropagation()}>
                    <button className="absolute top-4 right-4 text-neutral-400 hover:text-white" onClick={() => setShowInstallHelp(false)}><XIcon/></button>
                    <h3 className="text-2xl font-bold text-amber-500 mb-4">How to Install</h3>
                    <p className="text-neutral-300 mb-6">
                        The browser is not allowing automatic installation. Please install manually:
                    </p>
                    <ol className="list-decimal pl-5 space-y-4 text-neutral-200">
                        <li>
                            Look at the right side of your browser's address bar (URL bar).
                        </li>
                        <li>
                            Find an icon that looks like a <strong>Monitor with a down arrow</strong> or a <strong>Plus (+)</strong> sign.
                            <div className="mt-2 flex gap-2 opacity-70">
                                <span className="border border-neutral-600 rounded px-2 py-1 text-xs">Chrome / Edge</span>
                                <span className="border border-neutral-600 rounded px-2 py-1 text-xs">Yandex</span>
                            </div>
                        </li>
                        <li>
                            Click it and select <strong>"Install Deadlock Map Companion"</strong>.
                        </li>
                    </ol>
                    <div className="mt-8 pt-4 border-t border-neutral-800 flex justify-end">
                        <button onClick={() => setShowInstallHelp(false)} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded text-sm text-white">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  // Setup Crop View
  if (isSetupMode) {
    return (
      <div className="flex flex-col h-full bg-neutral-900 text-neutral-100 select-none">
        <header className="p-4 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center">
          <h2 className="text-xl font-bold text-amber-500">Adjust Minimap Region</h2>
          <div className="flex gap-4">
            <p className="text-sm text-neutral-400 self-center">
              Drag the box to position. Drag corners to resize.
            </p>
            <button
              onClick={() => setIsSetupMode(false)}
              className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded flex items-center gap-2"
            >
              <CheckIcon /> Confirm
            </button>
          </div>
        </header>
        
        <div className="flex-1 overflow-hidden relative flex justify-center items-center p-4 bg-black/50">
          <div className="relative border-2 border-neutral-700 shadow-2xl inline-block max-h-full max-w-full">
            <video
              ref={setupVideoRef}
              autoPlay
              playsInline
              muted
              className="max-h-[80vh] max-w-[90vw] block"
              onLoadedMetadata={(e) => {
                setVideoDim({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight });
              }}
            />
            
            {/* Interactive Crop Box */}
            <div
              className="absolute border-2 border-amber-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] group cursor-move"
              onMouseDown={handleMouseDownBox}
              style={{
                left: `${(cropRegion.x / videoDim.w) * 100}%`,
                top: `${(cropRegion.y / videoDim.h) * 100}%`,
                width: `${(cropRegion.width / videoDim.w) * 100}%`,
                height: `${(cropRegion.height / videoDim.h) * 100}%`
              }}
            >
              <div className="absolute -top-6 left-0 bg-amber-500 text-black text-xs px-1 font-bold pointer-events-none">MINIMAP ZONE</div>
              <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-black cursor-nwse-resize z-10" onMouseDown={handleMouseDownHandle('nw')} />
              <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-black cursor-nesw-resize z-10" onMouseDown={handleMouseDownHandle('ne')} />
              <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-black cursor-nesw-resize z-10" onMouseDown={handleMouseDownHandle('sw')} />
              <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-black cursor-nwse-resize z-10" onMouseDown={handleMouseDownHandle('se')} />
              <div className="absolute top-1/2 left-0 w-full h-px bg-amber-500/30 pointer-events-none" />
              <div className="absolute left-1/2 top-0 h-full w-px bg-amber-500/30 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Companion View
  return (
    <div className="flex h-full bg-neutral-950 font-sans">
      {/* Sidebar Controls */}
      <aside className="w-20 bg-neutral-900 border-r border-neutral-800 flex flex-col items-center py-6 gap-6 z-10">
        
        <div className="flex flex-col gap-3 w-full px-2">
           {/* Color Picker */}
           <div className="flex flex-wrap gap-2 justify-center mb-4">
            {['#ef4444', '#22c55e', '#eab308', '#3b82f6', '#ffffff'].map(c => (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                className={`w-6 h-6 rounded-full border-2 ${selectedColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <ToolButton 
            active={activeTool === ToolType.PEN} 
            onClick={() => setActiveTool(ToolType.PEN)}
            icon={<PenIcon />}
            label="Pen"
          />
          <ToolButton 
            active={activeTool === ToolType.MARKER} 
            onClick={() => setActiveTool(ToolType.MARKER)}
            icon={<div className="w-4 h-4 rounded-full bg-red-500 border border-white"></div>}
            label="Ping"
          />
          <ToolButton 
            active={false} 
            onClick={() => { setDrawings([]); setMarkers([]); }}
            icon={<TrashIcon />}
            label="Clear"
            variant="danger"
          />
        </div>

        <div className="mt-auto flex flex-col gap-4 w-full px-2">
           {hasApiKey && (
             <>
               <button
                onClick={() => setIsMuted(!isMuted)}
                className={`flex flex-col items-center p-2 rounded-lg transition-colors ${isMuted ? 'text-red-400' : 'text-neutral-400 hover:text-white'}`}
                title={isMuted ? "Unmute AI" : "Mute AI"}
               >
                 {isMuted ? <VolumeXIcon /> : <VolumeIcon />}
               </button>

               <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className={`flex flex-col items-center p-3 rounded-xl transition-all ${
                  isAnalyzing 
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' 
                  : 'bg-purple-900/50 text-purple-300 hover:bg-purple-800/50 hover:text-white border border-purple-700'
                }`}
              >
                {isAnalyzing ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mb-1"></div>
                ) : (
                  <BrainIcon />
                )}
                <span className="text-[10px] mt-1 uppercase font-bold">Scan</span>
              </button>
             </>
           )}

          <button
            onClick={() => setIsSetupMode(true)}
            className="flex flex-col items-center p-2 text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <div className="scale-75"><MonitorIcon /></div>
            <span className="text-[10px] mt-1">Adjust</span>
          </button>
          
           <button
            onClick={handleStopCapture}
            className="flex flex-col items-center p-2 text-red-900 hover:text-red-500 transition-colors"
          >
            <div className="scale-75"><XIcon /></div>
          </button>
          
          {!isStandalone && (
            <button
              onClick={handleInstallClick}
              className="flex flex-col items-center p-2 text-blue-400 hover:text-blue-300 transition-colors"
              title="Install Desktop App"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            </button>
          )}

           {/* Install Help Modal (Sidebar Version? Or just reuse the main one?) */}
           {/* If user clicks sidebar button, we reuse the same logic. */}
           {showInstallHelp && isSetupMode === false && (
               <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowInstallHelp(false)}>
                <div className="bg-neutral-900 border border-amber-500/50 rounded-2xl p-8 max-w-lg shadow-2xl relative" onClick={e => e.stopPropagation()}>
                    <button className="absolute top-4 right-4 text-neutral-400 hover:text-white" onClick={() => setShowInstallHelp(false)}><XIcon/></button>
                    <h3 className="text-2xl font-bold text-amber-500 mb-4">How to Install</h3>
                    <p className="text-neutral-300 mb-6">
                        The browser is not allowing automatic installation. Please install manually:
                    </p>
                    <ol className="list-decimal pl-5 space-y-4 text-neutral-200">
                        <li>
                            Look at the right side of your browser's address bar.
                        </li>
                        <li>
                            Find an icon that looks like a <strong>Monitor with a down arrow</strong> or a <strong>Plus (+)</strong> sign.
                        </li>
                        <li>
                            Click it and select <strong>"Install Deadlock Map Companion"</strong>.
                        </li>
                    </ol>
                     <div className="mt-8 pt-4 border-t border-neutral-800 flex justify-end">
                        <button onClick={() => setShowInstallHelp(false)} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded text-sm text-white">
                            Close
                        </button>
                    </div>
                </div>
            </div>
           )}
        </div>
      </aside>

      {/* Main Canvas Area */}
      <main className="flex-1 relative bg-black overflow-hidden">
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

        {/* AI Tactical Toast (Minimal) */}
        {latestAlert && latestAlert.text && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-neutral-900/90 border-l-4 border-purple-500 text-white px-6 py-3 rounded shadow-2xl backdrop-blur-md flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
             <BrainIcon />
             <div>
               <p className="font-bold text-lg tracking-wide uppercase text-purple-200">Tactical Alert</p>
               <p className="text-neutral-200">{latestAlert.text}</p>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Sub-component for Tool Buttons
const ToolButton = ({ active, onClick, icon, label, variant = 'default' }: any) => (
  <button
    onClick={onClick}
    className={`
      flex flex-col items-center justify-center p-3 rounded-xl transition-all w-full
      ${active ? 'bg-amber-600 text-white shadow-lg scale-105' : ''}
      ${!active && variant === 'default' ? 'text-neutral-400 hover:bg-neutral-800 hover:text-white' : ''}
      ${!active && variant === 'danger' ? 'text-red-400 hover:bg-red-900/30 hover:text-red-200' : ''}
    `}
  >
    <div className="mb-1">{icon}</div>
    <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
  </button>
);