'use strict'

const { contextBridge } = require('electron')

// Expose a minimal API to the renderer (React app).
// Everything sensitive stays in the main process.
contextBridge.exposeInMainWorld('electronApp', {
  platform: process.platform,   // 'win32' | 'darwin' | 'linux'
  isElectron: true,             // lets the app know it's running in Electron
})
