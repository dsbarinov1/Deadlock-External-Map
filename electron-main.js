const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Deadlock Map Companion",
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0a',
    icon: path.join(__dirname, 'public/icon.png'), // If you add an icon later
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load the Vite development server
  win.loadURL('http://localhost:3000');

  // Open the DevTools.
  // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});