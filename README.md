# Deadlock Map Companion

A tactical companion app for Deadlock. Mirror your minimap to a second screen, draw tactical lines, and use AI to analyze map positioning.

## Prerequisites

1.  **Node.js**: [Download](https://nodejs.org/).
2.  **Overwolf Client**: [Download](https://www.overwolf.com/).

## Installation & Setup

1.  Clone/Download this repo.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create `.env` file with your `API_KEY`.

## Running the App

### Option A: Overwolf App (Recommended for Games)
This runs the app inside the Overwolf ecosystem.

1.  Build the project:
    ```bash
    npm run build
    ```
    This creates a `dist` folder.
2.  Open **Overwolf Client** -> **Settings** (Right click tray icon) -> **Support** -> **Development Options**.
3.  Click **Load unpacked extension**.
4.  Select the `dist` folder inside this project.
5.  Click **Launch** next to "Deadlock Map Companion" in the Overwolf list.

### Option B: Desktop App (Electron)
```bash
npm run electron
```

### Option C: Web Browser
```bash
npm run dev
```
