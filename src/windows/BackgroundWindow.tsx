
import { useEffect } from 'react';
import { OWGames, OWGameListener, OWWindow } from '../lib/overwolf';
import { kWindowNames, kGameClassIds } from '../consts';

// The background controller holds all of the app's background logic.
// It manages which window is currently presented to the user (Desktop vs InGame).
class BackgroundController {
  private static _instance: BackgroundController;
  private _windows: Record<string, OWWindow> = {};
  private _gameListener: OWGameListener;

  private constructor() {
    // Populating the background controller's window dictionary
    this._windows[kWindowNames.desktop] = new OWWindow(kWindowNames.desktop);
    this._windows[kWindowNames.inGame] = new OWWindow(kWindowNames.inGame);

    // When a supported game is started or ended, toggle the app's windows
    this._gameListener = new OWGameListener({
      onGameStarted: this.toggleWindows.bind(this),
      onGameEnded: this.toggleWindows.bind(this)
    });

    overwolf.extensions.onAppLaunchTriggered.addListener((e: any) => this.onAppLaunchTriggered(e));
  };

  // Singleton instance
  public static instance(): BackgroundController {
    if (!BackgroundController._instance) {
      BackgroundController._instance = new BackgroundController();
    }
    return BackgroundController._instance;
  }

  // Start listening to game status
  public async run() {
    this._gameListener.start();
    
    // Check current state on startup
    const currWindowName = (await this.isSupportedGameRunning())
      ? kWindowNames.inGame // Can swap to desktop if you prefer desktop-first
      : kWindowNames.desktop;

    this._windows[currWindowName].restore();
  }

  private async onAppLaunchTriggered(e: any) {
    console.log('onAppLaunchTriggered():', e);

    if (!e || e.origin.includes('gamelaunchevent')) {
      return;
    }

    if (await this.isSupportedGameRunning()) {
      this._windows[kWindowNames.desktop].close();
      this._windows[kWindowNames.inGame].restore();
    } else {
      this._windows[kWindowNames.desktop].restore();
      this._windows[kWindowNames.inGame].close();
    }
  }

  private toggleWindows(info: any) {
    if (!info || !this.isSupportedGame(info)) {
      return;
    }

    if (info.isRunning) {
      this._windows[kWindowNames.desktop].close();
      this._windows[kWindowNames.inGame].restore();
    } else {
      this._windows[kWindowNames.desktop].restore();
      this._windows[kWindowNames.inGame].close();
    }
  }

  private async isSupportedGameRunning(): Promise<boolean> {
    const info = await OWGames.getRunningGameInfo();
    return info && info.isRunning && this.isSupportedGame(info);
  }

  private isSupportedGame(info: any) {
    // Check if classId matches Deadlock
    return kGameClassIds.includes(Math.floor(info.classId / 10));
  }
}

const BackgroundWindow = () => {
  useEffect(() => {
    // Initialize the singleton controller
    BackgroundController.instance().run();
  }, []);

  return <div style={{ color: 'white', padding: 10 }}>Deadlock Controller Running</div>;
};

export default BackgroundWindow;
