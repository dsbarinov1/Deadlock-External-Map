import React, { useState, useEffect } from 'react';
import BackgroundWindow from './windows/BackgroundWindow';
import DesktopWindow from './windows/DesktopWindow';
import { WINDOW_NAMES } from './services/windows';

const OverlayWindow = () => <div style={{width: '100%', height: '100%'}}></div>;

// ==========================================
// ROOT APP ROUTER
// ==========================================
export default function App() {
  const [currentWindowName, setCurrentWindowName] = useState<string | null>(null);

  useEffect(() => {
    // If running in browser dev mode (not Overwolf)
    if (typeof window.overwolf === 'undefined') {
        setCurrentWindowName(WINDOW_NAMES.DESKTOP); // Default to Desktop for dev
        return;
    }

    // Determine which window we are currently running in
    window.overwolf.windows.getCurrentWindow((result: any) => {
        if (result.status === "success") {
            setCurrentWindowName(result.window.name);
        } else {
            console.error("Failed to get current window");
        }
    });
  }, []);

  if (!currentWindowName) {
      return <div className="p-4 text-xs text-neutral-500">Loading Context...</div>;
  }

  // Routing
  switch (currentWindowName) {
      case WINDOW_NAMES.BACKGROUND:
          return <BackgroundWindow />;
      case WINDOW_NAMES.DESKTOP:
          return <DesktopWindow />;
      case WINDOW_NAMES.INGAME:
          return <OverlayWindow />;
      default:
          // Fallback, usually for development
          return <DesktopWindow />;
  }
}