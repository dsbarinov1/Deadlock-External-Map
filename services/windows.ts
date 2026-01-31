// Standard Overwolf Window Management Service
// Based on the Overwolf React Sample App

export const WINDOW_NAMES = {
  BACKGROUND: 'background',
  DESKTOP: 'desktop',
  INGAME: 'ingame',
};

export class WindowService {
  public static async obtainWindow(name: string): Promise<any> {
    return new Promise((resolve, reject) => {
      overwolf.windows.obtainDeclaredWindow(name, (result: any) => {
        if (result.status === 'success') {
          resolve(result.window);
        } else {
          reject(result);
        }
      });
    });
  }

  public static async restore(name: string): Promise<void> {
    const window = await this.obtainWindow(name);
    return new Promise((resolve) => {
      overwolf.windows.restore(window.id, () => resolve());
    });
  }

  public static async minimize(name: string): Promise<void> {
    const window = await this.obtainWindow(name);
    overwolf.windows.minimize(window.id, () => {});
  }

  public static async close(name: string): Promise<void> {
    const window = await this.obtainWindow(name);
    overwolf.windows.close(window.id, () => {});
  }

  public static async toggle(name: string): Promise<void> {
    const window = await this.obtainWindow(name);
    if (window.isVisible) {
      this.minimize(name);
    } else {
      this.restore(name);
    }
  }

  public static async getRunningGameInfo(): Promise<any> {
    return new Promise((resolve) => {
      overwolf.games.getRunningGameInfo((res: any) => resolve(res));
    });
  }
}