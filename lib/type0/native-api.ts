export type ProfileKey = 'Conservative' | 'Balanced' | 'Gaming' | 'Streaming' | 'Low Memory' | 'Aggressive'
export type TweakId = 'game_dvr' | 'transparency' | 'menu_delay' | 'visual_effects' | 'mouse_precision'
export type Sample = { ram: number; cpu: number }
export type Proc = {
  pid: number
  name: string
  user: string
  mem: number
  status: 'running' | 'sleeping'
  browser?: boolean
}
export type Settings = {
  profile: ProfileKey
  autoClean: boolean
  threshold: number
  pause: number
  minSize: number
  browsers: boolean
  gameMode: boolean
  tray: boolean
  startMinimized: boolean
  autostart: boolean
  interval: 1 | 2 | 3 | 5
  dim: number
}
export type LogAction = 'manual' | 'auto' | 'selected' | 'temp' | 'kill' | 'tweak'
export type LogEntry = {
  id: number
  at: number
  action: LogAction
  title: string
  freedMB: number
  before: number
  after: number
  details: string
}
export type NativeSnapshot = {
  ram: number
  cpu: number
  usedMB: number
  totalMB: number
  cores: number
  processes: Proc[]
  rowsUpdated: boolean
  processes?: Proc[]
  samples?: Sample[]
  metricVersion?: number
  sampleVersion?: number
  logs?: LogEntry[]
  cleaning: boolean
  timestamp: number
}
export type NativeInitialState = {
  snapshot: NativeSnapshot
  settings: Settings
  logs: LogEntry[]
  appliedTweaks: TweakId[]
  wallpaper: string | null
  paths: { data: string; program: string; startup: string; history: string; backup: string }
  dataDir: string
  programDir: string
}
export type NativeOperation = {
  ok: boolean
  error?: string
  message?: string
  details?: string
  freedMB?: number
  success?: number
  processed?: number
  deleted?: number
  skipped?: number
  appliedIds?: TweakId[]
  errors?: string[]
}
export type KillResult = { pid: number; name: string; status: string }
export type KillSummary = { ok: boolean; results: KillResult[]; snapshot: NativeSnapshot }

export type DesktopApi = {
  get_initial_state: () => Promise<NativeInitialState>
  get_snapshot: (force_processes?: boolean) => Promise<NativeSnapshot>
  save_settings: (settings: Settings) => Promise<{ ok: boolean; settings: Settings }>
  clean_processes: (pids: number[] | null, auto?: boolean) => Promise<NativeOperation>
  kill_processes: (pids: number[]) => Promise<KillSummary>
  clean_temp_files: () => Promise<NativeOperation>
  sync_tweaks: (desired_ids: TweakId[], title?: string) => Promise<NativeOperation>
  restore_tweaks: () => Promise<NativeOperation>
  set_wallpaper: (data_url: string, filename: string) => Promise<{ ok: boolean; wallpaper: string; path: string }>
  reset_wallpaper: () => Promise<{ ok: boolean; wallpaper: null }>
  open_folder: (kind: 'data' | 'program' | 'startup') => Promise<{ ok: boolean; path: string }>
  open_windows_setting: (uri: string) => Promise<{ ok: boolean }>
  open_disk_cleanup: () => Promise<{ ok: boolean }>
  minimize_window: () => Promise<{ ok: boolean }>
  toggle_maximize_window: () => Promise<{ maximized: boolean }>
  close_window: () => Promise<{ hidden: boolean }>
  begin_drag: () => Promise<{ ok: boolean }>
  set_window_interacting: (active: boolean) => Promise<{ ok: boolean }>
  get_paths: () => Promise<{ data: string; program: string; startup: string; history: string; backup: string }>
  show_window: () => Promise<{ ok: boolean }>
  request_refresh: () => Promise<NativeSnapshot>
}

declare global {
  interface Window {
    pywebview?: { api: DesktopApi }
  }
}

export function getDesktopApi(): DesktopApi | null {
  if (typeof window === 'undefined') return null
  return window.pywebview?.api ?? null
}
