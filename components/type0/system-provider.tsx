'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  CORES,
  INITIAL_PROCESSES,
  SYSTEM_BASE_MB,
  TOTAL_MB,
  type ProfileKey,
  type Proc,
  type TweakId,
} from '@/lib/type0/data'
import {
  getDesktopApi,
  type DesktopApi,
  type KillSummary,
  type LogAction,
  type LogEntry,
  type NativeInitialState,
  type NativeSnapshot,
  type Sample,
  type Settings,
} from '@/lib/type0/native-api'

export type { Sample, LogAction, LogEntry, Settings } from '@/lib/type0/native-api'

export const DEFAULT_SETTINGS: Settings = {
  profile: 'Balanced',
  autoClean: false,
  threshold: 85,
  pause: 180,
  minSize: 80,
  browsers: true,
  gameMode: true,
  tray: true,
  startMinimized: false,
  autostart: false,
  interval: 1,
  dim: 58,
}

type SystemCtx = {
  ram: number
  cpu: number
  usedMB: number
  totalMB: number
  cores: number
  samples: Sample[]
  processes: Proc[]
  log: LogEntry[]
  cleaning: boolean
  settings: Settings
  saveSettings: (s: Settings) => Promise<void>
  previewSettings: (s: Settings) => void
  appliedTweaks: TweakId[]
  setAppliedTweaks: (ids: TweakId[], title: string) => Promise<boolean>
  wallpaper: string | null
  setWallpaper: (value: string | null, filename?: string) => Promise<void>
  clean: (opts?: { pids?: number[]; auto?: boolean }) => Promise<number>
  kill: (pids: number[]) => Promise<KillSummary | null>
  cleanTemp: () => Promise<number>
  openFolder: (kind: 'data' | 'program' | 'startup') => Promise<void>
  openWindowsSetting: (uri: string) => Promise<void>
  openDiskCleanup: () => Promise<void>
  windowMinimize: () => Promise<void>
  windowToggleMaximize: () => Promise<boolean>
  windowClose: () => Promise<void>
  isDesktop: boolean
}

const Ctx = createContext<SystemCtx | null>(null)

export function useSystem() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSystem must be used inside SystemProvider')
  return c
}

const MAX_SAMPLES = 180
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const ramOf = (procs: Proc[]) => ((SYSTEM_BASE_MB + procs.reduce((s, p) => s + p.mem, 0)) / TOTAL_MB) * 100

function seedSamples(base: number): Sample[] {
  const out: Sample[] = []
  let cpu = 18
  for (let i = 0; i < 48; i++) {
    cpu = clamp(cpu + (Math.random() - 0.5) * 14, 4, 70)
    out.push({ ram: base - 4 + (i / 48) * 4 + Math.random() * 0.6, cpu })
  }
  return out
}

function seedLog(): LogEntry[] {
  return []
}

function settingsFromNative(s: Settings): Settings {
  return {
    profile: s.profile ?? DEFAULT_SETTINGS.profile,
    autoClean: Boolean(s.autoClean),
    threshold: Number(s.threshold ?? 85),
    pause: Number(s.pause ?? 180),
    minSize: Number(s.minSize ?? 80),
    browsers: Boolean(s.browsers),
    gameMode: Boolean(s.gameMode),
    tray: Boolean(s.tray),
    startMinimized: Boolean(s.startMinimized),
    autostart: Boolean(s.autostart),
    interval: ([1, 2, 3, 5].includes(Number(s.interval)) ? Number(s.interval) : 1) as Settings['interval'],
    dim: clamp(Number(s.dim ?? 58), 0, 90),
  }
}

export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [processes, setProcesses] = useState<Proc[]>(INITIAL_PROCESSES)
  const [ram, setRam] = useState(() => ramOf(INITIAL_PROCESSES))
  const [cpu, setCpu] = useState(22)
  const [usedMB, setUsedMB] = useState((ramOf(INITIAL_PROCESSES) / 100) * TOTAL_MB)
  const [totalMB, setTotalMB] = useState(TOTAL_MB)
  const [cores, setCores] = useState(CORES)
  const [samples, setSamples] = useState<Sample[]>(() => seedSamples(ramOf(INITIAL_PROCESSES)))
  const [log, setLog] = useState<LogEntry[]>(seedLog)
  const [cleaning, setCleaning] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [appliedTweaks, setApplied] = useState<TweakId[]>([])
  const [wallpaper, setWallpaperState] = useState<string | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const apiRef = useRef<DesktopApi | null>(null)
  const settingsRef = useRef(settings)
  const processesRef = useRef(processes)
  const cpuRef = useRef(cpu)
  const nativeBootedRef = useRef(false)
  const metricVersionRef = useRef(-1)
  const sampleVersionRef = useRef(-1)
  const draggingWindowRef = useRef(false)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pollResumeToken, setPollResumeToken] = useState(0)
  const cleaningRef = useRef(false)
  const lastAutoRef = useRef(0)
  const logId = useRef(10)
  const lastBackendErrorAt = useRef(0)
  const reportBackendError = useCallback((error: unknown) => {
    const now = Date.now()
    if (now - lastBackendErrorAt.current < 5000) return
    lastBackendErrorAt.current = now
    const detail = error instanceof Error ? error.message : String(error)
    window.dispatchEvent(new CustomEvent('type0:backend-error', { detail }))
  }, [])

  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { processesRef.current = processes }, [processes])
  useEffect(() => { cpuRef.current = cpu }, [cpu])

  const applySnapshot = useCallback((snap: NativeSnapshot) => {
    const metricVersion = Number(snap.metricVersion ?? snap.timestamp ?? 0)
    const metricsChanged = metricVersionRef.current !== metricVersion
    if (metricsChanged) {
      metricVersionRef.current = metricVersion
      setRam(Number(snap.ram) || 0)
      setCpu(Number(snap.cpu) || 0)
      setUsedMB(Number(snap.usedMB) || 0)
      setTotalMB(Number(snap.totalMB) || TOTAL_MB)
      setCores(Number(snap.cores) || 1)
    }

    const sampleVersion = Number(snap.sampleVersion ?? metricVersion)
    if (Array.isArray(snap.samples) && sampleVersionRef.current !== sampleVersion) {
      sampleVersionRef.current = sampleVersion
      setSamples(snap.samples.slice(-MAX_SAMPLES))
    } else if (!Array.isArray(snap.samples) && metricsChanged) {
      // Compatibility path for preview/older bridges that only provide a single sample.
      setSamples((prev) => [...prev, { ram: snap.ram, cpu: snap.cpu }].slice(-MAX_SAMPLES))
    }

    if (Array.isArray(snap.processes) && (snap.rowsUpdated || processesRef.current.length === 0)) {
      processesRef.current = snap.processes
      setProcesses(snap.processes)
    }
    if (Array.isArray(snap.logs)) setLog(snap.logs)
    const nextCleaning = Boolean(snap.cleaning)
    if (cleaningRef.current !== nextCleaning) {
      cleaningRef.current = nextCleaning
      setCleaning(nextCleaning)
    }
  }, [])

  const applyNativeInitial = useCallback((initial: NativeInitialState) => {
    apiRef.current = getDesktopApi()
    if (!apiRef.current) throw new Error('Связь с локальным API desktop-приложения недоступна.')
    setIsDesktop(true)
    nativeBootedRef.current = true
    setSettings(settingsFromNative(initial.settings))
    settingsRef.current = settingsFromNative(initial.settings)
    setApplied(Array.isArray(initial.appliedTweaks) ? initial.appliedTweaks : [])
    setWallpaperState(initial.wallpaper ?? null)
    setLog(Array.isArray(initial.logs) ? initial.logs : [])
    applySnapshot(initial.snapshot)
  }, [applySnapshot])

  // pywebview exposes the Python bridge after it raises "pywebviewready".
  // In a normal browser the UI remains in a clearly demo-only preview mode.
  useEffect(() => {
    let cancelled = false
    const connect = async () => {
      const api = getDesktopApi()
      if (!api || nativeBootedRef.current) return
      apiRef.current = api
      try {
        const state = await api.get_initial_state()
        if (!cancelled) applyNativeInitial(state)
      } catch (error) {
        console.error('type_0 desktop initialization failed', error)
        reportBackendError(error)
      }
    }
    void connect()
    const ready = () => { void connect() }
    window.addEventListener('pywebviewready', ready)
    return () => {
      cancelled = true
      window.removeEventListener('pywebviewready', ready)
    }
  }, [applyNativeInitial, reportBackendError])

  // Window movement is a native Windows operation. Pause bridge traffic while the OS
  // is moving the frameless window, then immediately poll once movement finishes.
  useEffect(() => {
    const begin = () => {
      draggingWindowRef.current = true
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
    const finish = () => {
      if (!draggingWindowRef.current) return
      draggingWindowRef.current = false
      setPollResumeToken((value) => value + 1)
    }
    window.addEventListener('type0:window-interaction-start', begin)
    window.addEventListener('type0:window-interaction-end', finish)
    return () => {
      window.removeEventListener('type0:window-interaction-start', begin)
      window.removeEventListener('type0:window-interaction-end', finish)
    }
  }, [])

  // Desktop snapshots are cheap cache reads now, so poll them at a short cadence to
  // deliver each 1/2/3/5-second telemetry sample promptly. Version refs prevent re-rendering
  // the entire UI for unchanged cached snapshots. No API traffic is sent while dragging.
  useEffect(() => {
    let stopped = false
    let busy = false
    let demoTimer: ReturnType<typeof setInterval> | undefined

    const schedulePoll = (delay = 300) => {
      if (stopped || draggingWindowRef.current) return
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      pollTimerRef.current = setTimeout(() => { void tick() }, delay)
    }

    const tick = async () => {
      if (stopped || draggingWindowRef.current) return
      if (busy) {
        schedulePoll(120)
        return
      }
      const api = apiRef.current
      if (!api || !isDesktop) return
      busy = true
      const started = performance.now()
      try {
        const snap = await api.get_snapshot()
        if (!stopped && !draggingWindowRef.current) applySnapshot(snap)
      } catch (error) {
        console.error('type_0 polling failed', error)
        reportBackendError(error)
      } finally {
        busy = false
        const elapsed = performance.now() - started
        schedulePoll(Math.max(80, 300 - elapsed))
      }
    }

    if (isDesktop && apiRef.current) {
      void tick()
    } else if (!isDesktop) {
      demoTimer = setInterval(() => {
        if (nativeBootedRef.current || draggingWindowRef.current) return
        const current = processesRef.current
        const next = current.map((p) => {
          const drift = 1 + (Math.random() - 0.46) * 0.035
          return { ...p, mem: clamp(p.mem * drift, 10, 1800) }
        })
        const v = clamp(cpuRef.current + (Math.random() - 0.5) * 8, 2, 96)
        processesRef.current = next
        setProcesses(next)
        setCpu(v)
        const r = ramOf(next)
        setRam(r)
        setUsedMB((r / 100) * TOTAL_MB)
        setSamples((prev) => [...prev, { ram: r, cpu: v }].slice(-MAX_SAMPLES))
      }, settings.interval * 1000)
    }
    return () => {
      stopped = true
      if (demoTimer) clearInterval(demoTimer)
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [isDesktop, settings.interval, applySnapshot, reportBackendError, pollResumeToken])

  const addDemoLog = useCallback((entry: Omit<LogEntry, 'id' | 'at'>) => {
    setLog((prev) => [{ ...entry, id: ++logId.current, at: Date.now() }, ...prev].slice(0, 200))
  }, [])

  const saveSettings = useCallback(async (nextSettings: Settings) => {
    const normalized = settingsFromNative(nextSettings)
    const api = apiRef.current
    if (isDesktop && api) {
      const result = await api.save_settings(normalized)
      if (!result?.ok) throw new Error('Не удалось сохранить настройки.')
      const stored = settingsFromNative(result.settings ?? normalized)
      settingsRef.current = stored
      setSettings(stored)
    } else {
      settingsRef.current = normalized
      setSettings(normalized)
    }
  }, [isDesktop])

  const previewSettings = useCallback((nextSettings: Settings) => {
    const normalized = settingsFromNative(nextSettings)
    settingsRef.current = normalized
    setSettings(normalized)
  }, [])

  const refreshNativeSnapshot = useCallback(async () => {
    const api = apiRef.current
    if (!isDesktop || !api) return
    // Action handlers should fetch the latest cached telemetry. Process scans are
    // handled by the background worker and an explicit process refresh can request one.
    const snap = await api.get_snapshot(false)
    applySnapshot(snap)
  }, [isDesktop, applySnapshot])

  const clean = useCallback<SystemCtx['clean']>(async ({ pids, auto } = {}) => {
    if (cleaningRef.current) return 0
    cleaningRef.current = true
    setCleaning(true)
    try {
      const api = apiRef.current
      if (isDesktop && api) {
        const result = await api.clean_processes(pids ?? null, Boolean(auto))
        if (!result.ok) throw new Error(result.error || 'Очистка не выполнена.')
        await refreshNativeSnapshot()
        return Number(result.freedMB) || 0
      }
      await sleep(500)
      const before = ramOf(processesRef.current)
      let freed = 0
      const selected = pids ? new Set(pids) : null
      const next = processesRef.current.map((p) => {
        const eligible = selected
          ? selected.has(p.pid)
          : p.mem >= settingsRef.current.minSize && (settingsRef.current.browsers || !p.browser) && p.name !== 'type_0.exe'
        if (!eligible) return p
        const mem = Math.max(12, p.mem * 0.55)
        freed += p.mem - mem
        return { ...p, mem }
      })
      processesRef.current = next
      setProcesses(next)
      const after = ramOf(next)
      setRam(after)
      setUsedMB((after / 100) * TOTAL_MB)
      addDemoLog({
        action: auto ? 'auto' : pids ? 'selected' : 'manual',
        title: auto ? 'Автоочистка по порогу' : pids ? 'Очистка выбранных' : 'Очистка рабочих наборов',
        freedMB: freed, before, after, details: `${next.length} процессов`,
      })
      return freed
    } finally {
      cleaningRef.current = false
      setCleaning(false)
    }
  }, [isDesktop, addDemoLog, refreshNativeSnapshot])

  const kill = useCallback<SystemCtx['kill']>(async (pids) => {
    const api = apiRef.current
    if (isDesktop && api) {
      const result = await api.kill_processes(pids)
      if (result.snapshot) applySnapshot(result.snapshot)
      return result
    }
    const removed = processesRef.current.filter((p) => pids.includes(p.pid))
    const next = processesRef.current.filter((p) => !pids.includes(p.pid))
    processesRef.current = next
    setProcesses(next)
    addDemoLog({
      action: 'kill', title: 'Завершение процессов',
      freedMB: removed.reduce((sum, p) => sum + p.mem, 0),
      before: ramOf(processesRef.current), after: ramOf(next), details: removed.map((p) => p.name).join(', '),
    })
    return null
  }, [isDesktop, applySnapshot, addDemoLog])

  const cleanTemp = useCallback(async () => {
    const api = apiRef.current
    if (isDesktop && api) {
      const result = await api.clean_temp_files()
      if (!result.ok) throw new Error(result.error || 'Не удалось очистить временные файлы.')
      await refreshNativeSnapshot()
      return Number(result.freedMB) || 0
    }
    await sleep(250)
    const freed = 120 + Math.random() * 800
    addDemoLog({ action: 'temp', title: 'Временные файлы', freedMB: freed, before: 0, after: 0, details: 'Демонстрационный результат' })
    return freed
  }, [isDesktop, addDemoLog, refreshNativeSnapshot])

  const setAppliedTweaks = useCallback<SystemCtx['setAppliedTweaks']>(async (ids, title) => {
    const api = apiRef.current
    if (isDesktop && api) {
      const result = ids.length ? await api.sync_tweaks(ids, title) : await api.restore_tweaks()
      setApplied(result.appliedIds ?? [])
      await refreshNativeSnapshot()
      if (!result.ok) throw new Error(result.message || result.error || (result.errors ?? []).join('\n') || 'Не удалось изменить настройки Windows.')
      return true
    }
    setApplied(ids)
    addDemoLog({ action: 'tweak', title, freedMB: 0, before: 0, after: 0, details: ids.length ? `${ids.length} параметров выбрано` : 'Исходные значения' })
    return true
  }, [isDesktop, addDemoLog, refreshNativeSnapshot])

  const setWallpaper = useCallback<SystemCtx['setWallpaper']>(async (value, filename = 'wallpaper') => {
    const api = apiRef.current
    if (isDesktop && api) {
      if (value === null) {
        const result = await api.reset_wallpaper()
        setWallpaperState(result.wallpaper)
        return
      }
      const result = await api.set_wallpaper(value, filename)
      setWallpaperState(result.wallpaper)
      return
    }
    setWallpaperState(value)
  }, [isDesktop])

  const openFolder = useCallback<SystemCtx['openFolder']>(async (kind) => {
    const api = apiRef.current
    if (!api) return
    await api.open_folder(kind)
  }, [])
  const openWindowsSetting = useCallback<SystemCtx['openWindowsSetting']>(async (uri) => {
    const api = apiRef.current
    if (!api) return
    await api.open_windows_setting(uri)
  }, [])
  const openDiskCleanup = useCallback<SystemCtx['openDiskCleanup']>(async () => {
    const api = apiRef.current
    if (!api) return
    await api.open_disk_cleanup()
  }, [])
  const windowMinimize = useCallback<SystemCtx['windowMinimize']>(async () => {
    const api = apiRef.current
    if (api) await api.minimize_window()
  }, [])
  const windowToggleMaximize = useCallback<SystemCtx['windowToggleMaximize']>(async () => {
    const api = apiRef.current
    if (api) {
      const result = await api.toggle_maximize_window()
      return Boolean(result.maximized)
    }
    return false
  }, [])
  const windowClose = useCallback<SystemCtx['windowClose']>(async () => {
    const api = apiRef.current
    if (api) await api.close_window()
  }, [])

  const value = useMemo<SystemCtx>(() => ({
    ram, cpu, usedMB, totalMB, cores, samples, processes, log, cleaning, settings,
    saveSettings, previewSettings, appliedTweaks, setAppliedTweaks, wallpaper, setWallpaper,
    clean, kill, cleanTemp, openFolder, openWindowsSetting, openDiskCleanup,
    windowMinimize, windowToggleMaximize, windowClose, isDesktop,
  }), [
    ram, cpu, usedMB, totalMB, cores, samples, processes, log, cleaning, settings, saveSettings,
    previewSettings, appliedTweaks, setAppliedTweaks, wallpaper, setWallpaper, clean, kill, cleanTemp,
    openFolder, openWindowsSetting, openDiskCleanup, windowMinimize, windowToggleMaximize, windowClose, isDesktop,
  ])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
