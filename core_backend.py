# -*- coding: utf-8 -*-
"""Small, UI-independent Windows core shared by the type_0 desktop bridge."""
import ctypes
import csv
import json
import os
import shutil
import subprocess
import sys
import time
import traceback
from pathlib import Path
from datetime import datetime

try:
    import psutil
except ImportError:
    psutil = None

APP = "type_0"
VERSION = "3.1.4"
DATA_ROOT = Path(os.getenv("APPDATA", str(Path.home())))
OLD_APPDIR = DATA_ROOT / "MemPilotMAX"
APPDIR = DATA_ROOT / "type_0"
APPDIR.mkdir(parents=True, exist_ok=True)
for _name in ("settings.json", "history.csv", "registry_backup.json", "diagnostics.log"):
    _src = OLD_APPDIR / _name
    _dst = APPDIR / _name
    if _src.is_file() and not _dst.exists():
        try:
            shutil.copy2(_src, _dst)
        except OSError:
            pass

CFGFILE = APPDIR / "settings.json"
LOGFILE = APPDIR / "history.csv"
CRASHLOG = APPDIR / "crash.log"
REG_BACKUP = APPDIR / "registry_backup.json"
GAMES = [
    "arcraiders.exe", "arc_raiders.exe", "cs2.exe",
    "valorant-win64-shipping.exe", "fortniteclient-win64-shipping.exe",
    "gta5.exe", "gta5_enhanced.exe", "helldivers2.exe", "eldenring.exe",
    "cyberpunk2077.exe", "r5apex.exe", "overwatch.exe",
    "deadbydaylight-win64-shipping.exe",
]
DEFAULT = {
    "auto_enabled": False, "threshold": 85, "cooldown": 180, "min_mb": 80,
    "profile": "Balanced", "clean_browsers": True, "game_mode": True,
    "autostart": False, "tray": True, "start_minimized": False,
    "refresh_interval": 1, "sidebar_collapsed": True, "background_image": "",
    "background_dim": 58, "games": GAMES,
    "exclude": [
        "system", "registry", "smss.exe", "csrss.exe", "wininit.exe",
        "winlogon.exe", "services.exe", "lsass.exe", "svchost.exe",
        "dwm.exe", "explorer.exe", "mempilot max.exe", "type_0.exe",
        "python.exe", "pythonw.exe",
    ],
}
PROFILES = {
    "Conservative": (92, 600, 200, "Минимум вмешательства, подходит для повседневной работы."),
    "Balanced": (85, 180, 80, "Универсальный вариант для обычного использования."),
    "Gaming": (94, 600, 250, "Редкие срабатывания; игровой режим отдельно ставит автоочистку на паузу."),
    "Streaming": (88, 240, 120, "Более осторожная очистка во время записи и стриминга."),
    "Low Memory": (82, 180, 50, "Для систем с небольшим объёмом ОЗУ. Возможны повторные подгрузки данных."),
    "Aggressive": (80, 90, 40, "Чаще проверяет память. Может вызывать повторную загрузку данных и микрофризы."),
}
PROFILE_LABELS = {
    "Conservative": "Осторожный", "Balanced": "Сбалансированный",
    "Gaming": "Игровой", "Streaming": "Стриминг",
    "Low Memory": "Мало ОЗУ", "Aggressive": "Агрессивный",
}
REG_TWEAKS = {
    "game_dvr": {
        "title": "Отключить фоновую запись Xbox / Game DVR",
        "values": [
            (r"Software\Microsoft\Windows\CurrentVersion\GameDVR", "AppCaptureEnabled", 0),
            (r"System\GameConfigStore", "GameDVR_Enabled", 0),
        ],
    },
    "transparency": {
        "title": "Отключить прозрачность Windows",
        "values": [(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "EnableTransparency", 0)],
    },
    "menu_delay": {
        "title": "Уменьшить задержку открытия меню",
        "values": [(r"Control Panel\Desktop", "MenuShowDelay", "100")],
    },
    "visual_effects": {
        "title": "Профиль визуальных эффектов «Быстродействие»",
        "values": [(r"Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects", "VisualFXSetting", 2)],
    },
    "mouse_precision": {
        "title": "Отключить «Повышенную точность указателя»",
        "values": [
            (r"Control Panel\Mouse", "MouseSpeed", "0"),
            (r"Control Panel\Mouse", "MouseThreshold1", "0"),
            (r"Control Panel\Mouse", "MouseThreshold2", "0"),
        ],
    },
}
SYSTEM_PROCESS_NAMES = {
    "system", "system idle process", "registry", "secure system", "memory compression",
    "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe",
    "lsass.exe", "svchost.exe", "dwm.exe", "explorer.exe", "fontdrvhost.exe",
    "spoolsv.exe", "searchindexer.exe", "searchhost.exe", "runtimebroker.exe",
    "sihost.exe", "taskhostw.exe", "ctfmon.exe", "dllhost.exe", "conhost.exe",
    "backgroundtaskhost.exe", "wmiprvse.exe", "audiodg.exe", "wudfhost.exe",
    "dashost.exe", "shellexperiencehost.exe", "startmenuexperiencehost.exe",
    "textinputhost.exe", "applicationframehost.exe", "lockapp.exe", "lsaiso.exe",
    "trustedinstaller.exe", "tiworker.exe", "msmpeng.exe", "nissrv.exe",
    "securityhealthservice.exe", "securityhealthsystray.exe",
}
BROWSER_NAMES = {
    "chrome.exe", "msedge.exe", "firefox.exe", "opera.exe", "opera_gx.exe",
    "brave.exe", "vivaldi.exe", "browser.exe", "waterfox.exe", "librewolf.exe",
}


def resource_path(relative):
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / relative


def settings_save(settings):
    APPDIR.mkdir(parents=True, exist_ok=True)
    tmp = CFGFILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, CFGFILE)


def settings_load():
    settings = DEFAULT.copy()
    try:
        loaded = json.loads(CFGFILE.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            settings.update(loaded)
    except Exception:
        pass
    if not settings.get("_migration_281_done", False):
        settings["start_minimized"] = False
        bg = str(settings.get("background_image") or "").strip()
        if bg:
            try:
                Path(bg).resolve().relative_to((APPDIR / "backgrounds").resolve())
            except (OSError, ValueError):
                settings["background_image"] = ""
        settings["_migration_281_done"] = True
        try:
            settings_save(settings)
        except Exception:
            pass
    if not settings.get("_migration_282_done", False):
        settings["start_minimized"] = False
        settings["background_image"] = ""
        settings["_migration_282_done"] = True
        try:
            settings_save(settings)
        except Exception:
            pass
    if not settings.get("_migration_300_done", False):
        # The first integrated desktop build must open visibly once, not inherit a stale
        # hidden/minimized flag from previous iterations. Users can re-enable it afterward.
        settings["start_minimized"] = False
        settings["_migration_300_done"] = True
        try:
            settings_save(settings)
        except Exception:
            pass
    try:
        if settings.get("profile") not in PROFILES:
            settings["profile"] = "Balanced"
        settings["threshold"] = max(50, min(99, int(settings.get("threshold", 85))))
        settings["cooldown"] = max(30, min(3600, int(settings.get("cooldown", 180))))
        settings["min_mb"] = max(10, min(4096, int(settings.get("min_mb", 80))))
        settings["refresh_interval"] = int(settings.get("refresh_interval", 1))
        if settings["refresh_interval"] not in (1, 2, 3, 5):
            settings["refresh_interval"] = 1
        settings["background_dim"] = max(0, min(90, int(settings.get("background_dim", 58))))
    except Exception:
        pass
    return settings


def write_crash_log(context, exc_info=None):
    try:
        APPDIR.mkdir(parents=True, exist_ok=True)
        with CRASHLOG.open("a", encoding="utf-8") as f:
            f.write(f"\n[{datetime.now().isoformat(timespec='seconds')}] {context}\n")
            if exc_info:
                f.write("".join(traceback.format_exception(*exc_info)))
            else:
                f.write("Details unavailable.\n")
    except Exception:
        pass


def fmt(n):
    n = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:,.1f} {unit}".replace(",", " ")
        n /= 1024


def working_set_trim(pid):
    if sys.platform != "win32":
        return False, "Windows only"
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    kernel.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]
    kernel.OpenProcess.restype = ctypes.c_void_p
    handle = kernel.OpenProcess(0x0400 | 0x0100 | 0x1000, False, int(pid))
    if not handle:
        return False, f"Нет доступа (WinError {ctypes.get_last_error()})"
    try:
        psapi.EmptyWorkingSet.argtypes = [ctypes.c_void_p]
        psapi.EmptyWorkingSet.restype = ctypes.c_int
        if psapi.EmptyWorkingSet(ctypes.c_void_p(handle)):
            return True, "ok"
        return False, f"Ошибка Windows {ctypes.get_last_error()}"
    finally:
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        kernel.CloseHandle(ctypes.c_void_p(handle))


def is_windows_system_process(name, exe=""):
    base = (name or "").casefold()
    if base in SYSTEM_PROCESS_NAMES:
        return True
    windir = os.environ.get("WINDIR") or os.environ.get("SystemRoot") or r"C:\Windows"
    if exe and sys.platform == "win32":
        try:
            root = os.path.normcase(os.path.abspath(windir))
            path = os.path.normcase(os.path.abspath(exe))
            if path.startswith("\\\\?\\"):
                path = path[4:]
            if os.path.commonpath((root, path)) == root:
                return True
        except (ValueError, OSError):
            pass
    return False


def get_rows():
    if psutil is None:
        return []
    out = []
    try:
        current_user = psutil.Process().username().casefold()
    except Exception:
        current_user = ""
    # Do not ask psutil for `exe` on every process. On Windows, resolving executable
    # paths may be slow or denied, and doing it for all PIDs once per refresh made the UI
    # hitch. Filter by PID, username and known system names first; only resolve `exe`
    # for remaining current-user applications as a final Windows-directory safeguard.
    for proc in psutil.process_iter(["pid", "name", "username", "memory_info", "status"]):
        try:
            d = proc.info
            name = d.get("name") or "?"
            username = d.get("username") or ""
            if int(d.get("pid") or 0) == os.getpid() or name.casefold() in {"type_0.exe", "type_0"}:
                continue
            if current_user and (not username or username.casefold() != current_user):
                continue
            if is_windows_system_process(name):
                continue
            try:
                exe = proc.exe()
            except (psutil.AccessDenied, psutil.NoSuchProcess, psutil.ZombieProcess, OSError):
                exe = ""
            if is_windows_system_process(name, exe):
                continue
            memory = d.get("memory_info")
            mem = int(memory.rss) if memory else 0
            status = d.get("status") or ""
            lowered = name.casefold()
            browser = lowered in BROWSER_NAMES or any(token in lowered for token in ("chrome", "msedge", "firefox", "opera", "brave", "vivaldi"))
            out.append({
                "pid": int(d["pid"]), "name": name, "user": username,
                "rss": mem, "status": status, "browser": bool(browser),
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, OSError, KeyError, TypeError):
            pass
    return sorted(out, key=lambda row: row["rss"], reverse=True)


def log(before, after, action, details):
    if not LOGFILE.exists():
        with LOGFILE.open("w", newline="", encoding="utf-8-sig") as f:
            csv.writer(f).writerow(["time", "action", "available_before_mb", "available_after_mb", "used_before_pct", "used_after_pct", "details"])
    with LOGFILE.open("a", newline="", encoding="utf-8-sig") as f:
        csv.writer(f).writerow([
            datetime.now().isoformat(timespec="seconds"),
            action,
            round(before.available / 1048576, 1),
            round(after.available / 1048576, 1),
            before.percent,
            after.percent,
            details,
        ])


def current_user():
    try:
        return psutil.Process().username().casefold()
    except Exception:
        return ""
