
import { useState, useEffect } from 'react';
import BackgroundWindow from './windows/BackgroundWindow';
import DesktopWindow from './windows/DesktopWindow';
import { kWindowNames } from './consts';

// ==========================================
// ROOT APP ROUTER
// ==========================================
export default function App() {
  const [currentWindowName, setCurrentWindowName] = useState<string | null>(null);

  useEffect(() => {
    // If running in browser dev mode (not Overwolf)
    if (typeof window.overwolf === 'undefined') {
        setCurrentWindowName(kWindowNames.desktop); // Default to Desktop for dev
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
      case kWindowNames.background:
          return <BackgroundWindow />;
      case kWindowNames.desktop:
          return <DesktopWindow />;
      case kWindowNames.inGame:
          // For now, overlay is just a placeholder or similar to desktop
          // In the future, this would be the transparent overlay
          return <DesktopWindow />; 
      default:
          return <DesktopWindow />;
  }
}
