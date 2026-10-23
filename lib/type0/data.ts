export type ProfileKey = 'Conservative' | 'Balanced' | 'Gaming' | 'Streaming' | 'Low Memory' | 'Aggressive'

export const PROFILES: Record<
  ProfileKey,
  { label: string; threshold: number; pause: number; minSize: number; desc: string }
> = {
  Conservative: { label: 'Осторожный', threshold: 92, pause: 600, minSize: 200, desc: 'Минимум вмешательства для повседневной работы.' },
  Balanced: { label: 'Сбалансированный', threshold: 85, pause: 180, minSize: 80, desc: 'Универсальный вариант для обычного использования.' },
  Gaming: { label: 'Игровой', threshold: 94, pause: 600, minSize: 250, desc: 'Редкие срабатывания, пауза во время игр.' },
  Streaming: { label: 'Стриминг', threshold: 88, pause: 240, minSize: 120, desc: 'Бережная очистка во время записи и эфира.' },
  'Low Memory': { label: 'Мало ОЗУ', threshold: 82, pause: 180, minSize: 50, desc: 'Для систем с небольшим объёмом памяти.' },
  Aggressive: { label: 'Агрессивный', threshold: 80, pause: 90, minSize: 40, desc: 'Частые проверки. Возможны микрофризы.' },
}

export const PROFILE_KEYS = Object.keys(PROFILES) as ProfileKey[]

export type TweakId = 'game_dvr' | 'transparency' | 'menu_delay' | 'visual_effects' | 'mouse_precision'

export const TWEAKS: { id: TweakId; title: string; desc: string; keys: string[] }[] = [
  {
    id: 'game_dvr',
    title: 'Отключить фоновую запись Xbox / Game DVR',
    desc: 'Отключает фоновый захват клипов. Запись через Xbox Game Bar может перестать работать.',
    keys: ['GameDVR\\AppCaptureEnabled', 'GameConfigStore\\GameDVR_Enabled'],
  },
  {
    id: 'transparency',
    title: 'Отключить прозрачность Windows',
    desc: 'Упрощает оформление окон. Практически не влияет на FPS.',
    keys: ['Personalize\\EnableTransparency'],
  },
  {
    id: 'menu_delay',
    title: 'Уменьшить задержку открытия меню',
    desc: 'Повышает субъективную отзывчивость интерфейса, игры не ускоряет.',
    keys: ['Desktop\\MenuShowDelay'],
  },
  {
    id: 'visual_effects',
    title: 'Визуальные эффекты «Быстродействие»',
    desc: 'Упрощает анимации Windows для текущего пользователя.',
    keys: ['VisualEffects\\VisualFXSetting'],
  },
  {
    id: 'mouse_precision',
    title: 'Отключить «Повышенную точность указателя»',
    desc: 'Убирает ускорение курсора — удобно для мышечной памяти в шутерах.',
    keys: ['Mouse\\MouseSpeed', 'Mouse\\MouseThreshold1', 'Mouse\\MouseThreshold2'],
  },
]

export type Proc = {
  pid: number
  name: string
  user: string
  mem: number
  status: 'running' | 'sleeping'
  browser?: boolean
}

const USER = 'DESKTOP\\user'

export const INITIAL_PROCESSES: Proc[] = [
  { pid: 11204, name: 'chrome.exe', user: USER, mem: 612, status: 'running', browser: true },
  { pid: 11872, name: 'chrome.exe', user: USER, mem: 388, status: 'running', browser: true },
  { pid: 12040, name: 'chrome.exe', user: USER, mem: 241, status: 'sleeping', browser: true },
  { pid: 9384, name: 'Code.exe', user: USER, mem: 534, status: 'running' },
  { pid: 7720, name: 'Discord.exe', user: USER, mem: 402, status: 'running' },
  { pid: 6604, name: 'steamwebhelper.exe', user: USER, mem: 296, status: 'sleeping' },
  { pid: 5512, name: 'Telegram.exe', user: USER, mem: 214, status: 'running' },
  { pid: 14420, name: 'obs64.exe', user: USER, mem: 318, status: 'running' },
  { pid: 8840, name: 'Spotify.exe', user: USER, mem: 187, status: 'running' },
  { pid: 4410, name: 'explorer.exe', user: USER, mem: 142, status: 'running' },
  { pid: 15032, name: 'Figma.exe', user: USER, mem: 456, status: 'running' },
  { pid: 13308, name: 'Notion.exe', user: USER, mem: 268, status: 'sleeping' },
  { pid: 10116, name: 'msedgewebview2.exe', user: USER, mem: 132, status: 'sleeping', browser: true },
  { pid: 3324, name: 'SearchHost.exe', user: USER, mem: 96, status: 'sleeping' },
  { pid: 3980, name: 'RuntimeBroker.exe', user: USER, mem: 34, status: 'sleeping' },
  { pid: 9012, name: 'node.exe', user: USER, mem: 176, status: 'running' },
  { pid: 9056, name: 'python.exe', user: USER, mem: 148, status: 'running' },
  { pid: 7004, name: 'PhoneExperienceHost.exe', user: USER, mem: 61, status: 'sleeping' },
  { pid: 2876, name: 'ShellExperienceHost.exe', user: USER, mem: 72, status: 'sleeping' },
  { pid: 16200, name: 'type_0.exe', user: USER, mem: 58, status: 'running' },
]

export const TOTAL_MB = 16 * 1024
export const SYSTEM_BASE_MB = 4300
export const CORES = 12

export function formatMB(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} ГБ`
  return `${Math.round(mb)} МБ`
}

export function formatRelative(at: number) {
  const sec = Math.round((Date.now() - at) / 1000)
  if (sec < 30) return 'только что'
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))} мин назад`
  if (sec < 86400) return `${Math.round(sec / 3600)} ч назад`
  return new Date(at).toLocaleDateString('ru-RU')
}

export function formatDuration(sec: number) {
  if (sec < 60) return `${sec} с`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} мин ${s} с` : `${m} мин`
}
