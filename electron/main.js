'use strict'

const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')

const PORT = 3100
const isDev = process.env.NODE_ENV === 'development'

let mainWindow = null
let nextProcess = null

// ── Start the bundled Next.js standalone server ───────────────────────────────
function startNextServer () {
  return new Promise((resolve, reject) => {
    if (isDev) {
      // In dev mode the user runs `next dev` separately; just resolve immediately
      return resolve()
    }

    // Standalone server lives in resources/app/.next/standalone/server.js
    const serverJs = path.join(
      process.resourcesPath,
      'app',
      '.next',
      'standalone',
      'server.js'
    )

    nextProcess = spawn(process.execPath, [serverJs], {
      env: {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
      },
      cwd: path.join(process.resourcesPath, 'app', '.next', 'standalone'),
    })

    nextProcess.stdout.on('data', d => {
      const msg = d.toString()
      if (msg.includes('started server') || msg.includes('ready')) resolve()
    })
    nextProcess.stderr.on('data', d => process.stderr.write(d))
    nextProcess.on('error', reject)

    // Fallback: poll until the server responds
    let attempts = 0
    const poll = setInterval(() => {
      attempts++
      http.get(`http://127.0.0.1:${PORT}`, () => {
        clearInterval(poll)
        resolve()
      }).on('error', () => {
        if (attempts > 30) { clearInterval(poll); reject(new Error('Next.js server did not start')) }
      })
    }, 500)
  })
}

// ── Create the main window ────────────────────────────────────────────────────
async function createWindow () {
  mainWindow = new BrowserWindow({
    width:  1366,
    height: 768,
    minWidth:  1024,
    minHeight: 600,
    title: 'NexPOS Pro',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false, // show after load to avoid white flash
    autoHideMenuBar: true,
  })

  // Loading screen while Next.js boots
  mainWindow.loadFile(path.join(__dirname, 'loading.html'))
  mainWindow.show()

  try {
    await startNextServer()
    const url = isDev ? 'http://localhost:3000' : `http://127.0.0.1:${PORT}`
    await mainWindow.loadURL(url)
  } catch (err) {
    console.error('Failed to start server:', err)
    mainWindow.loadFile(path.join(__dirname, 'error.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (nextProcess) { nextProcess.kill('SIGTERM'); nextProcess = null }
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

// Open external links in the default browser, not in Electron
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })
})
