# Deadlock Map Companion

A tactical companion app for Deadlock. Mirror your minimap to a second screen, draw tactical lines, and use AI to analyze map positioning.

## Prerequisites

1.  **Node.js**: You must have Node.js installed (Version 18 or higher recommended). [Download here](https://nodejs.org/).
2.  **Git**: To clone the repository (or you can download the ZIP).

## Installation (Local)

1.  **Clone or Download** this project to a folder on your computer.
2.  Open a terminal (Command Prompt, PowerShell, or Terminal) in that folder.
3.  Install dependencies:
    ```bash
    npm install
    ```

## Configuration

1.  Create a file named `.env` in the root of the project folder.
2.  Add your Google Gemini API Key to this file:
    ```env
    API_KEY=your_actual_api_key_here
    ```
    *(Note: The app expects the variable name `API_KEY`)*

## Running the App

### Option A: Desktop App (Electron) - Recommended
This runs the app in a dedicated window, perfect for placing on a second monitor.

```bash
npm run electron
```

### Option B: Web Browser
This runs the app in your default web browser.

```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) if it doesn't open automatically.

## Troubleshooting

*   **"npm is not recognized"**: Ensure Node.js is installed and added to your PATH. Restart your terminal after installing Node.js.
*   **API Key Error**: Make sure you created the `.env` file correctly in the main folder (not inside src).
