
// Ported from @overwolf/overwolf-api-ts
// This provides the stable window management logic from the Sample App

export class OWGames {
  public static getRunningGameInfo(): Promise<any> {
    return new Promise((resolve) => {
      overwolf.games.getRunningGameInfo(resolve);
    });
  }

  public static async getRecentlyPlayedGames(limit = 3): Promise<any> {
    return new Promise((resolve) => {
      if (!overwolf.games.getRecentlyPlayedGames) {
        return resolve(null);
      }
      overwolf.games.getRecentlyPlayedGames(limit, (result: any) => {
        resolve(result.games);
      });
    });
  }
}

export class OWGameListener {
  private _delegate: any;

  constructor(delegate: any) {
    this._delegate = delegate;
  }

  public start() {
    overwolf.games.onGameInfoUpdated.addListener(this.onGameInfoUpdated);
    overwolf.games.getRunningGameInfo(this.onRunningGameInfo);
  }

  public stop() {
    overwolf.games.onGameInfoUpdated.removeListener(this.onGameInfoUpdated);
  }

  private onGameInfoUpdated = (update: any) => {
    if (!update || !update.gameInfo) {
      return;
    }

    if (!update.runningChanged && !update.gameChanged) {
      return;
    }

    if (update.gameInfo.isRunning) {
      if (this._delegate.onGameStarted) {
        this._delegate.onGameStarted(update.gameInfo);
      }
    } else {
      if (this._delegate.onGameEnded) {
        this._delegate.onGameEnded(update.gameInfo);
      }
    }
  };

  private onRunningGameInfo = (info: any) => {
    if (!info) {
      return;
    }

    if (info.isRunning) {
      if (this._delegate.onGameStarted) {
        this._delegate.onGameStarted(info);
      }
    }
  };
}

export class OWWindow {
  private _name: string;
  private _id: string | null = null;

  constructor(name: string) {
    this._name = name;
  }

  public async restore(): Promise<void> {
    const that = this;
    return new Promise(async (resolve) => {
      await that.assureObtained();
      if (that._id) {
        overwolf.windows.restore(that._id, () => resolve());
      }
    });
  }

  public async minimize(): Promise<void> {
    const that = this;
    return new Promise(async (resolve) => {
      await that.assureObtained();
      if (that._id) {
        overwolf.windows.minimize(that._id, () => {});
      }
      resolve();
    });
  }

  public async maximize(): Promise<void> {
    const that = this;
    return new Promise(async (resolve) => {
      await that.assureObtained();
      if (that._id) {
        overwolf.windows.maximize(that._id, () => {});
      }
      resolve();
    });
  }

  public async close(): Promise<void> {
    const that = this;
    return new Promise(async (resolve) => {
      await that.assureObtained();
      if (that._id) {
        overwolf.windows.close(that._id, () => {});
      }
      resolve();
    });
  }

  public dragMove(elem: HTMLElement) {
    elem.onmousedown = (e) => {
      e.preventDefault();
      overwolf.windows.dragMove(this._name);
    };
  }

  public async getWindowState(): Promise<any> {
    const that = this;
    return new Promise(async (resolve) => {
      await that.assureObtained();
      if (that._id) {
        overwolf.windows.getWindowState(that._id, resolve);
      } else {
        resolve({ success: false });
      }
    });
  }

  private obtain(): Promise<any> {
    return new Promise((resolve, reject) => {
      const cb = (res: any) => {
        if (res && res.status === "success" && res.window && res.window.id) {
          this._id = res.window.id;
          resolve(res.window);
        } else {
          this._id = null;
          reject();
        }
      };
      overwolf.windows.obtainDeclaredWindow(this._name, cb);
    });
  }

  private async assureObtained(): Promise<void> {
    const that = this;
    return new Promise(async (resolve) => {
      await that.obtain();
      resolve();
    });
  }
}
