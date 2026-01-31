import { useEffect } from 'react';
import { WindowService, WINDOW_NAMES } from '../services/windows';

const DEADLOCK_GAME_ID = 24201;

const BackgroundWindow = () => {
  useEffect(() => {
    console.log("[Background] Initialized");

    // 1. Register Hotkeys
    overwolf.settings.hotkeys.onPressed.addListener((e: any) => {
      if (e.name === "toggle_app") {
        WindowService.toggle(WINDOW_NAMES.DESKTOP);
      }
    });

    // 2. Register Game Launch Events
    overwolf.games.onGameLaunched.addListener((e: any) => {
      if (Math.floor(e.classId / 10) === Math.floor(DEADLOCK_GAME_ID / 10)) {
         console.log("[Background] Game Launched");
         // Optionally open overlay here, but let's stick to Desktop for the companion logic
         WindowService.restore(WINDOW_NAMES.DESKTOP);
      }
    });

    // 3. Register App Launch (Dock/Desktop icon)
    overwolf.extensions.onAppLaunchTriggered.addListener(() => {
       console.log("[Background] App Launch Triggered");
       WindowService.restore(WINDOW_NAMES.DESKTOP);
    });

    // 4. Check initial state
    const init = async () => {
      const gameInfo = await WindowService.getRunningGameInfo();
      // Always restore Desktop window on start so user sees something
      WindowService.restore(WINDOW_NAMES.DESKTOP);

      if (gameInfo && gameInfo.isRunning && Math.floor(gameInfo.id / 10) === Math.floor(DEADLOCK_GAME_ID / 10)) {
         console.log("[Background] Game already running");
         // If we had an overlay, we would open it here
         // WindowService.restore(WINDOW_NAMES.INGAME);
      }
    };

    init();
  }, []);

  return <div style={{ color: 'white', padding: 10 }}>Background Controller Running</div>;
};

export default BackgroundWindow;