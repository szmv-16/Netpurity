import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { runScan } from '../src/core/engine.ts'
import { collectSystemInfo } from '../src/core/probes/system.ts'
import { UNLOCK_SERVICES, probeAllUnlock, probeUnlock } from '../src/core/probes/unlock.ts'
import { addHistory, clearHistory, listHistory } from './history.ts'
import type { ScanOptions, ScanReport, WebRtcResult } from '../src/core/types.ts'

/* ------------------------------------------------------------------ *
 * 启动日志：静默崩溃时这是唯一线索。
 * 位置：%TEMP%\netpurity\boot.log
 * ------------------------------------------------------------------ */
const LOG_DIR = join(process.env.TEMP ?? process.env.LOCALAPPDATA ?? '.', 'netpurity')
const LOG_FILE = join(LOG_DIR, 'boot.log')

function bootLog(message: string, extra?: unknown): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    const detail = extra === undefined ? '' : ` ${JSON.stringify(extra)}`
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}${detail}\n`, 'utf8')
  } catch {
    /* 日志失败绝不能影响启动 */
  }
}

bootLog('boot:start', {
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch
})

process.on('uncaughtException', (err) => bootLog('uncaughtException', { message: err.message, stack: err.stack }))
process.on('unhandledRejection', (reason) => bootLog('unhandledRejection', { reason: String(reason) }))

// 虚拟机、远程桌面、老显卡驱动、以及管理员权限启动时，Chromium 的 GPU 子进程
// 经常直接启动失败（error_code=18），进程随即 FATAL 退出。
// 这个应用是纯 2D 界面，关掉硬件加速没有任何体验损失，但能避开一整类兼容性问题。
// 需要时可以用 NP_GPU=1 重新打开，方便排查。
app.disableHardwareAcceleration()
if (process.env.NP_GPU === '1') {
  app.commandLine.appendSwitch('enable-gpu')
}
// 老系统 / 受限环境下渲染进程也可能被沙箱挡住，兜底允许软件渲染
app.commandLine.appendSwitch('disable-gpu-sandbox')
// 让系统对话框、右键菜单等原生部件也跟随深色，避免一片亮白
nativeTheme.themeSource = 'dark'
bootLog('boot:hardware-acceleration-disabled')

let win: BrowserWindow | null = null

/** 标题栏高度，与渲染进程里的 .titlebar-drag 保持一致 */
const TITLEBAR_HEIGHT = 38

function createWindow(): void {
  bootLog('window:creating')
  win = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 920,
    minHeight: 680,
    show: false,
    backgroundColor: '#080b10',
    autoHideMenuBar: true,
    title: 'NetPurity',
    // 隐藏原生白色标题栏，改为与界面同色的窗口控制条（按钮仍是系统原生的）
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32'
      ? {
          titleBarOverlay: {
            color: '#080b10',
            symbolColor: '#c9d5e4',
            height: TITLEBAR_HEIGHT
          }
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  bootLog('window:created')

  win.on('ready-to-show', () => {
    bootLog('window:ready-to-show')
    win?.show()
    bootLog('window:shown', { visible: win?.isVisible() })
  })

  // 兜底：少数环境（老驱动、远程会话、某些安全软件）ready-to-show 永远不触发，
  // 窗口会一直隐藏着，用户看到的就是「进程在跑但没有界面」。
  const forceShow = setTimeout(() => {
    if (win && !win.isVisible()) {
      bootLog('window:force-show', { visible: win.isVisible() })
      win.center()
      win.show()
      win.focus()
    }
  }, 1500)
  win.once('closed', () => clearTimeout(forceShow))

  win.webContents.on('did-finish-load', () => bootLog('page:loaded'))
  win.webContents.on('did-fail-load', (_e, code, desc, url) =>
    bootLog('page:failed', { code, desc, url })
  )
  win.webContents.on('render-process-gone', (_e, details) => bootLog('page:render-process-gone', details))
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    // 只记录错误级别，避免刷屏
    if (level >= 2) bootLog('page:console', { message: message.slice(0, 400), source, line })
  })
  win.on('unresponsive', () => bootLog('window:unresponsive'))

  // 外链一律用系统浏览器打开，不在应用内导航
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    bootLog('page:loading-url', { url: process.env.ELECTRON_RENDERER_URL })
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    const file = join(__dirname, '../renderer/index.html')
    bootLog('page:loading-file', { file })
    void win.loadFile(file)
  }

  // 文档 / CI 用：NP_SHOT=<png 路径> 时，等检测跑完后截图并退出
  if (process.env.NP_SHOT) {
    const target = process.env.NP_SHOT
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          try {
            const image = await win!.webContents.capturePage()
            const { writeFileSync } = await import('node:fs')
            writeFileSync(target, image.toPNG())
          } finally {
            app.quit()
          }
        })()
      }, Number(process.env.NP_SHOT_DELAY ?? 14000))
    })
  }
}

app.whenReady().then(() => {
  bootLog('app:ready')

  ipcMain.handle('scan:run', async (event, payload: { webrtc?: WebRtcResult }) => {
    bootLog('ipc:scan:run')
    const opts: ScanOptions = {
      webrtc: payload?.webrtc,
      onProgress: (p) => {
        if (!event.sender.isDestroyed()) event.sender.send('scan:progress', p)
      }
    }
    try {
      opts.system = await collectSystemInfo().catch(() => undefined)
      return await runScan(opts)
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('system:info', () => collectSystemInfo())
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:versions', () => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform} ${process.arch}`
  }))

  ipcMain.handle('unlock:services', () => UNLOCK_SERVICES)

  ipcMain.handle('unlock:test', async (_e, id: string) => {
    const svc = UNLOCK_SERVICES.find((s) => s.id === id)
    if (!svc) return { error: `未知服务：${id}` }
    return probeUnlock(svc)
  })

  ipcMain.handle('unlock:test-all', async (event) => {
    return probeAllUnlock((r) => {
      if (!event.sender.isDestroyed()) event.sender.send('unlock:progress', r)
    })
  })
  ipcMain.handle('shell:open', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return Promise.resolve()
  })

  ipcMain.handle('history:list', () => listHistory())
  ipcMain.handle('history:add', (_e, report: ScanReport) => addHistory(report))
  ipcMain.handle('history:clear', () => clearHistory())

  ipcMain.handle('export:json', async (_e, report: ScanReport) => {
    if (!win) return { ok: false, error: '窗口未就绪' }
    const stamp = new Date(report.startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: '导出检测报告',
      defaultPath: `netpurity-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    await writeFile(filePath, JSON.stringify(report, null, 2), 'utf8')
    return { ok: true, path: filePath }
  })

  ipcMain.handle('export:pdf', async () => {
    if (!win) return { ok: false, error: '窗口未就绪' }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: '导出 PDF 报告',
      defaultPath: `netpurity-${stamp}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    })
    await writeFile(filePath, pdf)
    return { ok: true, path: filePath }
  })

  ipcMain.handle('clipboard:copy', (_e, text: string) => {
    clipboard.writeText(text)
    return true
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('child-process-gone', (_e, details) => bootLog('app:child-process-gone', details))
app.on('before-quit', () => bootLog('app:before-quit'))
app.on('will-quit', () => bootLog('app:will-quit'))

app.on('window-all-closed', () => {
  bootLog('app:window-all-closed')
  if (process.platform !== 'darwin') app.quit()
})
