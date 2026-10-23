# -*- coding: utf-8 -*-
"""Python bridge for the React type_0 interface."""
from __future__ import annotations

import base64
import csv
import ctypes
import io
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from collections import deque
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

import core_backend as core

try:
    import psutil
except ImportError:
    psutil = None


class DesktopAPI:
    def __init__(self):
        self.window = None
        self.c = core.settings_load()
        self._lock = threading.RLock()
        self._clean_lock = threading.Lock()
        self._cleaning = False
        self._last_auto = 0.0
        self._last_game_scan = 0.0
        self._game_running_cache = False
        self._last_process_scan = 0.0
        self._cached_rows = []
        self._rows_generation = 0
        self._rows_delivered_generation = -1
        self._process_scan_lock = threading.Lock()
        self._samples = deque(maxlen=180)
        self._sample_version = 0
        self._samples_delivered_version = -1
        self._metric_version = 0
        self._last_sample_at = 0.0
        self._latest_metrics = {"ram": 0.0, "cpu": 0.0, "usedMB": 0.0, "totalMB": 0.0, "cores": 1}
        self._cached_cores = 1
        self._history_cache = None
        self._history_stamp = None
        self._ui_interacting = False
        self._metrics_wakeup = threading.Event()
        self._tray_icon = None
        self._tray_thread = None
        self._shutdown = threading.Event()
        self._maximized = False
        self._last_metrics_error_at = 0.0
        self._paths = {
            "data": str(core.APPDIR),
            "program": str(self.program_dir()),
            "startup": str(self.startup_dir()),
            "history": str(core.LOGFILE),
            "backup": str(core.REG_BACKUP),
        }
        if psutil:
            try:
                # Warm up psutil's non-blocking CPU sampler once. All later samples
                # are collected by one dedicated worker, never by UI bridge calls.
                psutil.cpu_percent(interval=None)
                memory = psutil.virtual_memory()
                self._cached_cores = int(psutil.cpu_count(logical=True) or 1)
                self._latest_metrics = {
                    "ram": float(memory.percent),
                    "cpu": 0.0,
                    "usedMB": memory.used / 1048576,
                    "totalMB": memory.total / 1048576,
                    "cores": self._cached_cores,
                }
                self._samples.append({"ram": float(memory.percent), "cpu": 0.0})
                self._metric_version = 1
                self._sample_version = 1
                self._last_sample_at = time.monotonic()
            except Exception:
                core.write_crash_log("Initial metrics read failed", sys.exc_info())

        # These workers keep expensive OS sampling out of pywebview's request path.
        self._metrics_thread = threading.Thread(target=self._metrics_loop, name="type0-metrics", daemon=True)
        self._process_thread = threading.Thread(target=self._process_refresh_loop, name="type0-process-scan", daemon=True)
        self._metrics_thread.start()
        self._process_thread.start()

    # ---- Public API called from the local React UI ----

    def get_initial_state(self):
        snap = self.get_snapshot(force_processes=True)
        logs = snap.get("logs")
        if not isinstance(logs, list):
            logs = self._read_history(force=True)
        return {
            "snapshot": snap,
            "settings": self._settings_to_ui(),
            "logs": logs,
            "appliedTweaks": self._get_applied_tweak_ids(),
            "wallpaper": self._wallpaper_uri(),
            "paths": dict(self._paths),
            "dataDir": str(core.APPDIR),
            "programDir": str(self.program_dir()),
        }

    def get_snapshot(self, force_processes=False):
        """Return a cheap cached snapshot; all expensive sampling happens on workers."""
        if psutil is None:
            raise RuntimeError("Не найден psutil. Запустите build_exe.bat ещё раз.")

        if force_processes:
            self._refresh_process_cache()

        with self._lock:
            metrics = dict(self._latest_metrics)
            samples = list(self._samples)
            metric_version = self._metric_version
            sample_version = self._sample_version
            rows_version = self._rows_generation
            rows_updated = rows_version != self._rows_delivered_generation
            if rows_updated:
                rows = list(self._cached_rows)
                self._rows_delivered_generation = rows_version
            else:
                rows = None
            samples_updated = sample_version != self._samples_delivered_version
            if samples_updated:
                self._samples_delivered_version = sample_version
                samples_to_send = samples
            else:
                samples_to_send = None
            cleaning = bool(self._cleaning)

        snapshot = {
            **metrics,
            "rowsUpdated": rows_updated,
            "metricVersion": metric_version,
            "sampleVersion": sample_version,
            "cleaning": cleaning,
            "timestamp": time.time() * 1000,
        }
        if samples_to_send is not None:
            snapshot["samples"] = samples_to_send
        # Process rows are sent only when a scan finishes or a user explicitly asks
        # to refresh the table. This keeps JSON serialization off the hot path.
        if rows is not None:
            snapshot["processes"] = [self._row_to_ui(row) for row in rows]

        logs = self._read_history_if_changed()
        if logs is not None:
            snapshot["logs"] = logs
        return snapshot

    def _metrics_loop(self):
        """Collect CPU/RAM at a stable cadence independent of UI rendering or window drag."""
        while not self._shutdown.is_set():
            interval = max(1.0, float(self.c.get("refresh_interval", 1)))
            cadence_changed = self._metrics_wakeup.wait(interval)
            self._metrics_wakeup.clear()
            if self._shutdown.is_set():
                break
            if cadence_changed:
                # The timer has been signalled because the user changed the refresh
                # interval; recalculate it instead of taking a too-close CPU sample.
                continue
            try:
                memory = psutil.virtual_memory()
                cpu = float(psutil.cpu_percent(interval=None))
                now = time.monotonic()
                ram_pct = float(memory.percent)
                sample = {"ram": ram_pct, "cpu": cpu}
                with self._lock:
                    self._latest_metrics = {
                        "ram": ram_pct,
                        "cpu": cpu,
                        "usedMB": memory.used / 1048576,
                        "totalMB": memory.total / 1048576,
                        "cores": self._cached_cores,
                    }
                    self._metric_version += 1
                    if not self._samples or now - self._last_sample_at >= max(0.75, interval * 0.8):
                        self._samples.append(sample)
                        self._sample_version += 1
                        self._last_sample_at = now
                    rows = list(self._cached_rows)
                try:
                    self._maybe_auto_clean(ram_pct, rows)
                except Exception:
                    core.write_crash_log("Automatic cleanup check failed", sys.exc_info())
            except Exception:
                now = time.monotonic()
                if now - self._last_metrics_error_at >= 10:
                    self._last_metrics_error_at = now
                    core.write_crash_log("Background metrics sampler failed", sys.exc_info())

    def _process_refresh_loop(self):
        """Refresh expensive process details less often than the lightweight CPU/RAM sampler."""
        while not self._shutdown.is_set():
            interval = max(2.5, min(4.0, float(self.c.get("refresh_interval", 1)) * 2.0))
            if self._shutdown.wait(interval):
                break
            if self._ui_interacting or self._shutdown.is_set():
                continue
            self._refresh_process_cache()

    def _refresh_process_cache(self):
        if psutil is None:
            return False
        with self._process_scan_lock:
            try:
                rows = core.get_rows()
            except Exception:
                core.write_crash_log("Process scan failed", sys.exc_info())
                return False
            with self._lock:
                self._cached_rows = rows
                self._last_process_scan = time.monotonic()
                self._rows_generation += 1
            return True

    def set_window_interacting(self, active):
        """Pause expensive process enumeration while the native window is being dragged."""
        self._ui_interacting = bool(active)
        return {"ok": True}

    def save_settings(self, values):
        if not isinstance(values, dict):
            raise ValueError("Некорректный формат настроек.")
        allowed_profiles = set(core.PROFILES)
        profile = str(values.get("profile", self.c.get("profile", "Balanced")))
        if profile not in allowed_profiles:
            raise ValueError("Неизвестный профиль.")
        try:
            threshold = max(50, min(99, int(values.get("threshold", self.c.get("threshold", 85)))))
            pause = max(30, min(3600, int(values.get("pause", self.c.get("cooldown", 180)))))
            min_size = max(10, min(4096, int(values.get("minSize", self.c.get("min_mb", 80)))))
            interval = int(values.get("interval", self.c.get("refresh_interval", 1)))
            dim = max(0, min(90, int(values.get("dim", self.c.get("background_dim", 58)))))
        except (TypeError, ValueError) as exc:
            raise ValueError("Некорректные числовые настройки.") from exc
        if interval not in (1, 2, 3, 5):
            raise ValueError("Интервал обновления должен быть 1, 2, 3 или 5 секунд.")

        old = dict(self.c)
        updated = dict(self.c)
        updated.update({
            "profile": profile,
            "auto_enabled": bool(values.get("autoClean", updated.get("auto_enabled", False))),
            "threshold": threshold,
            "cooldown": pause,
            "min_mb": min_size,
            "clean_browsers": bool(values.get("browsers", updated.get("clean_browsers", True))),
            "game_mode": bool(values.get("gameMode", updated.get("game_mode", True))),
            "tray": bool(values.get("tray", updated.get("tray", True))),
            "start_minimized": bool(values.get("startMinimized", updated.get("start_minimized", False))),
            "autostart": bool(values.get("autostart", updated.get("autostart", False))),
            "refresh_interval": interval,
            "background_dim": dim,
        })
        # Do not let settings from an older/malicious file change the exclude list.
        updated["exclude"] = list(core.DEFAULT["exclude"])
        autostart_changed = bool(old.get("autostart")) != bool(updated.get("autostart"))
        try:
            # Keep the shortcut and persisted setting consistent: apply the shortcut change
            # before committing the settings, and roll it back if saving fails.
            if sys.platform == "win32" and autostart_changed:
                self._set_autostart(bool(updated["autostart"]))
            try:
                core.settings_save(updated)
            except Exception:
                if sys.platform == "win32" and autostart_changed:
                    try:
                        self._set_autostart(bool(old.get("autostart")))
                    except Exception:
                        core.write_crash_log("Autostart rollback failed", sys.exc_info())
                raise
        except Exception:
            core.write_crash_log("Saving settings failed", sys.exc_info())
            raise
        self.c = updated
        if int(old.get("refresh_interval", 1)) != int(updated.get("refresh_interval", 1)):
            # Wake the timer so it can pick up the new cadence, then wait a full new
            # interval before sampling CPU again. Calling cpu_percent twice in quick
            # succession would produce a misleading near-zero sample.
            self._metrics_wakeup.set()
        self._paths["program"] = str(self.program_dir())
        if old.get("tray", True) and not updated["tray"]:
            self._stop_tray()
        elif updated["tray"]:
            self._ensure_tray()
        return {"ok": True, "settings": self._settings_to_ui()}

    def clean_processes(self, pids=None, auto=False):
        if psutil is None:
            raise RuntimeError("psutil не установлен.")
        if not self._clean_lock.acquire(blocking=False):
            return {"ok": False, "error": "Очистка уже выполняется.", "freedMB": 0.0}
        self._cleaning = True
        try:
            before = psutil.virtual_memory()
            rows = core.get_rows()
            if pids is None:
                eligible = []
                for row in rows:
                    if row["rss"] < int(self.c.get("min_mb", 80)) * 1048576:
                        continue
                    if row.get("browser") and not self.c.get("clean_browsers", True):
                        continue
                    if row["name"].casefold() in {"type_0.exe", "type_0"}:
                        continue
                    eligible.append(row)
                targets = eligible
            else:
                selected = {int(pid) for pid in pids if str(pid).isdigit()}
                by_pid = {int(row["pid"]): row for row in rows}
                targets = [by_pid[pid] for pid in selected if pid in by_pid]

            success = 0
            failures = []
            estimated_freed = 0
            processed = 0
            for row in targets:
                pid = int(row["pid"])
                try:
                    # Re-check the live process identity just before calling the Windows API.
                    proc = psutil.Process(pid)
                    if proc.name().casefold() != row["name"].casefold():
                        continue
                    before_rss = proc.memory_info().rss
                    ok, reason = core.working_set_trim(pid)
                    processed += 1
                    if ok:
                        success += 1
                        try:
                            after_rss = proc.memory_info().rss
                            estimated_freed += max(0, before_rss - after_rss)
                        except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
                            pass
                    elif len(failures) < 8:
                        failures.append(f"{row['name']} PID {pid}: {reason}")
                except (psutil.NoSuchProcess, psutil.ZombieProcess):
                    continue
                except psutil.AccessDenied:
                    if len(failures) < 8:
                        failures.append(f"{row['name']} PID {pid}: отказано в доступе")
                except Exception as exc:
                    if len(failures) < 8:
                        failures.append(f"{row['name']} PID {pid}: {exc}")

            time.sleep(0.15)
            after = psutil.virtual_memory()
            freed_mb = max(0.0, estimated_freed / 1048576)
            # Available-memory delta is a secondary observation, not a guaranteed freed amount.
            available_delta = (after.available - before.available) / 1048576
            if freed_mb <= 0 and available_delta > 0:
                freed_mb = min(float(available_delta), float(sum(r["rss"] for r in targets) / 1048576))
            action = "Автоочистка" if auto else ("Выбранные процессы" if pids is not None else "Ручная очистка")
            detail = f"Успешно обработано: {success}; ошибок/недоступно: {len(targets) - success}; процессов выбрано: {len(targets)}"
            if failures:
                detail += " | " + "; ".join(failures)
            try:
                core.log(before, after, action, detail)
            except Exception:
                core.write_crash_log("Could not write cleanup history", sys.exc_info())
            return {"ok": True, "freedMB": round(freed_mb, 1), "success": success,
                    "processed": processed, "details": detail, "failures": failures}
        finally:
            self._cleaning = False
            self._clean_lock.release()
            self._refresh_process_cache()

    def kill_processes(self, pids):
        if psutil is None:
            raise RuntimeError("psutil не установлен.")
        wanted = []
        for value in (pids or [])[:200]:
            try:
                pid = int(value)
                if pid > 4 and pid != os.getpid():
                    wanted.append(pid)
            except (TypeError, ValueError):
                continue

        before = psutil.virtual_memory()
        current_rows = {int(r["pid"]): r for r in core.get_rows()}
        results = []
        for pid in dict.fromkeys(wanted):
            row = current_rows.get(pid)
            if row is None:
                results.append({"pid": pid, "name": "?", "status": "Не найден или защищён системным фильтром"})
                continue
            name = row["name"]
            try:
                proc = psutil.Process(pid)
                live_name = proc.name()
                try:
                    exe = proc.exe()
                except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
                    exe = ""
                if live_name.casefold() != name.casefold() or core.is_windows_system_process(live_name, exe):
                    results.append({"pid": pid, "name": live_name, "status": "Защищённый/изменившийся процесс пропущен"})
                    continue
                if proc.username().casefold() != core.current_user():
                    results.append({"pid": pid, "name": live_name, "status": "Другой пользователь; действие запрещено"})
                    continue
                proc.terminate()
                try:
                    proc.wait(timeout=2.0)
                    status = "Завершён"
                except psutil.TimeoutExpired:
                    proc.kill()
                    try:
                        proc.wait(timeout=2.0)
                        status = "Принудительно завершён"
                    except psutil.TimeoutExpired:
                        status = "Процесс всё ещё работает"
                results.append({"pid": pid, "name": live_name, "status": status})
            except psutil.NoSuchProcess:
                results.append({"pid": pid, "name": name, "status": "Уже закрыт"})
            except psutil.AccessDenied:
                results.append({"pid": pid, "name": name, "status": "Отказано в доступе; может потребоваться запуск от администратора"})
            except Exception as exc:
                results.append({"pid": pid, "name": name, "status": f"Ошибка: {exc}"})

        after = psutil.virtual_memory()
        successful = [r for r in results if r["status"] in ("Завершён", "Принудительно завершён", "Уже закрыт")]
        details = "; ".join(f"{r['name']} PID {r['pid']}: {r['status']}" for r in results)
        try:
            core.log(before, after, "Завершение процессов", details[:2000])
        except Exception:
            core.write_crash_log("Could not write termination history", sys.exc_info())
        self._refresh_process_cache()
        return {"ok": bool(successful), "results": results, "snapshot": self.get_snapshot(force_processes=False)}

    def clean_temp_files(self):
        targets = []
        raw = [os.getenv("TEMP")]
        local_appdata = os.getenv("LOCALAPPDATA")
        if local_appdata:
            raw.append(str(Path(local_appdata) / "Temp"))
        known = set()
        for item in raw:
            if not item:
                continue
            try:
                path = Path(item).expanduser()
                if not path.is_absolute() or not path.exists() or not path.is_dir() or path.is_symlink():
                    continue
                real = str(path.resolve()).casefold()
                if real not in known:
                    targets.append(path)
                    known.add(real)
            except OSError:
                continue

        before = psutil.virtual_memory() if psutil else None
        deleted = skipped = freed = 0

        def size_of(path):
            if path.is_symlink():
                return 0
            total = 0
            try:
                if path.is_file():
                    return path.stat().st_size
                for root, dirs, files in os.walk(path, topdown=True, followlinks=False):
                    dirs[:] = [d for d in dirs if not os.path.islink(os.path.join(root, d))]
                    for name in files:
                        fp = os.path.join(root, name)
                        try:
                            if not os.path.islink(fp):
                                total += os.path.getsize(fp)
                        except OSError:
                            pass
            except OSError:
                pass
            return total

        for folder in targets:
            try:
                entries = list(folder.iterdir())
            except OSError:
                skipped += 1
                continue
            for entry in entries:
                try:
                    if entry.is_symlink():
                        entry.unlink()
                    elif entry.is_dir():
                        freed += size_of(entry)
                        shutil.rmtree(entry)
                    elif entry.is_file():
                        freed += entry.stat().st_size
                        entry.unlink()
                    deleted += 1
                except (OSError, PermissionError):
                    skipped += 1

        after = psutil.virtual_memory() if psutil else None
        if before is not None and after is not None:
            try:
                core.log(before, after, "Временные файлы", f"Удалено элементов: {deleted}; пропущено: {skipped}; освобождено приблизительно: {core.fmt(freed)}")
            except Exception:
                core.write_crash_log("Could not write temp cleanup history", sys.exc_info())
        return {"ok": True, "deleted": deleted, "skipped": skipped, "freedMB": round(freed / 1048576, 1)}

    def sync_tweaks(self, desired_ids, title="Применение настроек Windows"):
        if sys.platform != "win32":
            return {"ok": False, "error": "Изменение реестра доступно только в Windows.", "appliedIds": []}
        valid = {str(x) for x in (desired_ids or []) if str(x) in core.REG_TWEAKS}
        try:
            import winreg
        except ImportError:
            return {"ok": False, "error": "Модуль реестра Windows недоступен.", "appliedIds": []}

        backup = self._load_registry_backup()
        current = set(self._get_applied_tweak_ids())
        failures = []
        changed = 0

        # First restore any currently-applied tweak that is no longer desired.
        for tweak_id in sorted(current - valid):
            entries = self._entries_for_tweak(tweak_id)
            for path, name, _target in core.REG_TWEAKS[tweak_id]["values"]:
                ident = path + "|" + name
                entry = backup.get(ident)
                if not entry:
                    failures.append(f"{path}\\{name}: нет сохранённого исходного значения")
                    continue
                try:
                    self._restore_registry_value(winreg, entry["path"], entry["name"], entry["original"])
                    check = self._reg_read(path, name)
                    original = entry["original"]
                    if self._same_reg_value(check, original):
                        backup.pop(ident, None)
                        changed += 1
                    else:
                        failures.append(f"{path}\\{name}: проверка восстановления не прошла")
                except Exception as exc:
                    failures.append(f"{path}\\{name}: {exc}")

        # Apply target settings, preserving original values only on first touch.
        for tweak_id in sorted(valid - current):
            for path, name, target in core.REG_TWEAKS[tweak_id]["values"]:
                ident = path + "|" + name
                if ident not in backup:
                    backup[ident] = {"path": path, "name": name, "original": self._reg_read(path, name)}
                try:
                    kind = winreg.REG_SZ if isinstance(target, str) else winreg.REG_DWORD
                    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_SET_VALUE) as key:
                        winreg.SetValueEx(key, name, 0, kind, target)
                    check = self._reg_read(path, name)
                    if not check.get("exists") or check.get("value") != target or check.get("kind") != kind:
                        raise OSError(f"проверка значения {name} не прошла")
                    changed += 1
                except Exception as exc:
                    failures.append(f"{path}\\{name}: {exc}")

        self._save_registry_backup(backup)
        self._broadcast_setting_change()
        self._write_action_log("Реестр", title + ": " + (", ".join(sorted(valid)) or "исходные значения"))
        applied = self._get_applied_tweak_ids()
        return {"ok": not failures, "appliedIds": applied, "changed": changed, "errors": failures,
                "message": "Настройки реестра проверены." if not failures else "Некоторые параметры не удалось применить/восстановить: " + "; ".join(failures[:5])}

    def restore_tweaks(self):
        if sys.platform != "win32":
            return {"ok": False, "error": "Восстановление реестра доступно только в Windows.", "appliedIds": []}
        try:
            import winreg
        except ImportError:
            return {"ok": False, "error": "Модуль реестра Windows недоступен.", "appliedIds": []}
        backup = self._load_registry_backup()
        if not backup:
            return {"ok": True, "appliedIds": [], "message": "Резервная копия пуста."}
        pending = {}
        restored = 0
        failures = []
        for ident, entry in backup.items():
            try:
                self._restore_registry_value(winreg, entry["path"], entry["name"], entry["original"])
                check = self._reg_read(entry["path"], entry["name"])
                if self._same_reg_value(check, entry["original"]):
                    restored += 1
                else:
                    pending[ident] = entry
                    failures.append(f"{entry['path']}\\{entry['name']}: проверка восстановления не прошла")
            except Exception as exc:
                pending[ident] = entry
                failures.append(f"{entry['path']}\\{entry['name']}: {exc}")
        self._save_registry_backup(pending)
        self._broadcast_setting_change()
        self._write_action_log("Реестр", f"Восстановление исходных значений: {restored}")
        return {"ok": not failures, "appliedIds": self._get_applied_tweak_ids(), "restored": restored,
                "errors": failures, "message": f"Восстановлено значений: {restored}" if not failures else "Часть значений не удалось восстановить; резервная копия сохранена."}

    def set_wallpaper(self, data_url, filename="wallpaper"):
        if not isinstance(data_url, str) or not data_url.startswith("data:image/"):
            raise ValueError("Не удалось прочитать изображение.")
        try:
            header, encoded = data_url.split(",", 1)
            raw = base64.b64decode(encoded, validate=True)
        except Exception as exc:
            raise ValueError("Повреждённые данные изображения.") from exc
        if len(raw) > 25 * 1024 * 1024:
            raise ValueError("Размер изображения превышает 25 МБ.")
        try:
            from PIL import Image
            with Image.open(io.BytesIO(raw)) as image:
                image.verify()
            with Image.open(io.BytesIO(raw)) as image:
                image_format = (image.format or "").upper()
                if image.width * image.height > 80_000_000:
                    raise ValueError("Слишком большое разрешение изображения.")
                extensions = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp", "GIF": ".gif", "BMP": ".bmp"}
                ext = extensions.get(image_format)
                if not ext:
                    raise ValueError("Поддерживаются PNG, JPG, WEBP, GIF и BMP.")
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("Файл не является корректным изображением.") from exc

        folder = core.APPDIR / "backgrounds"
        folder.mkdir(parents=True, exist_ok=True)
        safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(filename or "wallpaper").stem).strip("._-")[:48] or "wallpaper"
        target = folder / f"{safe_name}_{uuid.uuid4().hex[:8]}{ext}"
        target.write_bytes(raw)
        self.c["background_image"] = str(target)
        core.settings_save(self.c)
        return {"ok": True, "wallpaper": target.resolve().as_uri(), "path": str(target)}

    def reset_wallpaper(self):
        self.c["background_image"] = ""
        core.settings_save(self.c)
        return {"ok": True, "wallpaper": None}

    def open_folder(self, kind):
        paths = {
            "data": core.APPDIR,
            "program": self.program_dir(),
            "startup": self.startup_dir(),
        }
        if kind not in paths:
            raise ValueError("Неизвестная папка.")
        path = paths[kind]
        path.mkdir(parents=True, exist_ok=True) if kind in ("data", "startup") else None
        if sys.platform == "win32":
            os.startfile(str(path))
        else:
            import webbrowser
            webbrowser.open(path.resolve().as_uri())
        return {"ok": True, "path": str(path)}

    def open_windows_setting(self, uri):
        if sys.platform != "win32":
            raise RuntimeError("Этот переход доступен только в Windows.")
        uri = str(uri or "")
        if not (uri.startswith("ms-settings:") or uri.startswith("windowsdefender:")):
            raise ValueError("Разрешены только штатные ссылки параметров Windows.")
        os.startfile(uri)
        return {"ok": True}

    def open_disk_cleanup(self):
        if sys.platform != "win32":
            raise RuntimeError("Очистка диска Windows доступна только в Windows.")
        subprocess.Popen(["cleanmgr.exe"], shell=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return {"ok": True}

    def minimize_window(self):
        if self.window:
            self.window.minimize()
        return {"ok": True}

    def toggle_maximize_window(self):
        if self.window:
            try:
                self._maximized = not self._maximized
                if self._maximized:
                    self.window.maximize()
                else:
                    self.window.restore()
            except Exception:
                self._maximized = False
                try:
                    self.window.restore()
                except Exception:
                    pass
        return {"maximized": self._maximized}

    def close_window(self):
        # Never hide the only window if tray initialization failed. That would leave
        # a running process with no visible way to reopen it.
        if self.c.get("tray", True) and self._ensure_tray():
            try:
                if self.window:
                    self.window.hide()
                return {"hidden": True}
            except Exception:
                core.write_crash_log("Could not hide to tray", sys.exc_info())
        if self.window:
            self.window.destroy()
        self._shutdown.set()
        return {"hidden": False}

    def begin_drag(self):
        # pywebview's easy_drag handles title-bar dragging on the native window.
        return {"ok": True}

    def get_paths(self):
        return {
            "data": str(core.APPDIR),
            "program": str(self.program_dir()),
            "startup": str(self.startup_dir()),
            "history": str(core.LOGFILE),
            "backup": str(core.REG_BACKUP),
        }

    def show_window(self):
        if self.window:
            self.window.show()
            try:
                self.window.restore()
            except Exception:
                pass
            try:
                self.window.on_top = True
                self.window.on_top = False
            except Exception:
                pass
        return {"ok": True}

    def request_refresh(self):
        return self.get_snapshot(force_processes=True)

    # ---- Internal helpers ----

    def attach_window(self, window):
        self.window = window
        if self.c.get("tray", True):
            self._ensure_tray()

    def startup(self):
        tray_ready = self._ensure_tray() if self.c.get("tray", True) else False
        if self.c.get("start_minimized", False) and self.window:
            try:
                if tray_ready:
                    self.window.hide()
                else:
                    # Keep a discoverable taskbar window if the tray is unavailable.
                    self.window.minimize()
            except Exception:
                core.write_crash_log("Could not apply start-minimized preference", sys.exc_info())

    def shutdown(self):
        self._shutdown.set()
        self._metrics_wakeup.set()
        self._stop_tray()

    def _settings_to_ui(self):
        return {
            "profile": self.c.get("profile", "Balanced"),
            "autoClean": bool(self.c.get("auto_enabled", False)),
            "threshold": int(self.c.get("threshold", 85)),
            "pause": int(self.c.get("cooldown", 180)),
            "minSize": int(self.c.get("min_mb", 80)),
            "browsers": bool(self.c.get("clean_browsers", True)),
            "gameMode": bool(self.c.get("game_mode", True)),
            "tray": bool(self.c.get("tray", True)),
            "startMinimized": bool(self.c.get("start_minimized", False)),
            "autostart": bool(self.c.get("autostart", False)),
            "interval": int(self.c.get("refresh_interval", 1)),
            "dim": int(self.c.get("background_dim", 58)),
        }

    def _row_to_ui(self, row):
        name = str(row.get("name") or "?")
        return {
            "pid": int(row["pid"]),
            "name": name,
            "user": str(row.get("user") or ""),
            "mem": float(row.get("rss", 0)) / 1048576,
            "status": "running" if str(row.get("status", "")).casefold() in {"running", "disk-sleep", "wake-kill"} else "sleeping",
            "browser": bool(row.get("browser", False)),
        }

    def _wallpaper_uri(self):
        raw = str(self.c.get("background_image") or "").strip()
        if not raw:
            return None
        path = Path(raw)
        try:
            if path.is_file() and path.stat().st_size <= 25 * 1024 * 1024:
                return path.resolve().as_uri()
        except OSError:
            pass
        return None

    @staticmethod
    def _history_file_stamp():
        try:
            stat = core.LOGFILE.stat()
            return (stat.st_mtime_ns, stat.st_size)
        except OSError:
            return (0, 0)

    def _read_history_if_changed(self):
        stamp = self._history_file_stamp()
        if self._history_cache is not None and stamp == self._history_stamp:
            return None
        return self._read_history(force=True)

    def _read_history(self, force=False):
        stamp = self._history_file_stamp()
        if not force and self._history_cache is not None and stamp == self._history_stamp:
            return list(self._history_cache)
        if stamp == (0, 0):
            items = []
            self._history_cache = items
            self._history_stamp = stamp
            return []
        items = []
        try:
            with core.LOGFILE.open("r", newline="", encoding="utf-8-sig") as stream:
                records = list(csv.DictReader(stream))[-200:]
            for index, row in enumerate(reversed(records)):
                raw_time = row.get("time", "")
                try:
                    at = datetime.fromisoformat(raw_time).timestamp() * 1000
                except (ValueError, TypeError, OSError):
                    at = time.time() * 1000
                action_text = str(row.get("action", ""))
                lower = action_text.casefold()
                if "авто" in lower:
                    action = "auto"
                    title = "Автоочистка по порогу"
                elif "выбран" in lower or "selected" in lower:
                    action = "selected"
                    title = "Очистка выбранных процессов"
                elif "врем" in lower or "temp" in lower:
                    action = "temp"
                    title = "Временные файлы"
                elif "заверш" in lower or "kill" in lower:
                    action = "kill"
                    title = "Завершение процессов"
                elif "реестр" in lower or "tweak" in lower:
                    action = "tweak"
                    title = "Настройки Windows"
                else:
                    action = "manual"
                    title = "Очистка рабочих наборов"
                before = float(row.get("used_before_pct") or 0)
                after = float(row.get("used_after_pct") or 0)
                available_before = float(row.get("available_before_mb") or 0)
                available_after = float(row.get("available_after_mb") or 0)
                freed = max(0.0, available_after - available_before)
                items.append({
                    "id": len(records) - index,
                    "at": at,
                    "action": action,
                    "title": title,
                    "freedMB": freed,
                    "before": before,
                    "after": after,
                    "details": str(row.get("details") or ""),
                })
        except Exception:
            core.write_crash_log("Reading history CSV failed", sys.exc_info())
        self._history_cache = items
        self._history_stamp = self._history_file_stamp()
        return list(items)

    def _write_action_log(self, action, details):
        if not psutil:
            return
        try:
            memory = psutil.virtual_memory()
            core.log(memory, memory, action, details)
        except Exception:
            core.write_crash_log("Writing action history failed", sys.exc_info())

    def _maybe_auto_clean(self, ram_pct, rows):
        if not self.c.get("auto_enabled", False) or self._cleaning:
            return
        if ram_pct < int(self.c.get("threshold", 85)):
            return
        now = time.monotonic()
        if now - self._last_auto < int(self.c.get("cooldown", 180)):
            return
        if self.c.get("game_mode", True):
            game_names = {str(x).casefold() for x in self.c.get("games", core.GAMES)}
            running = {str(row.get("name", "")).casefold() for row in rows}
            if running.intersection(game_names):
                self._game_running_cache = True
                self._last_game_scan = now
                return
            # A full process-name scan is throttled: under memory pressure this method can
            # be called each metrics cycle, so enumerating all processes every second is costly.
            if now - self._last_game_scan >= 5.0:
                found = False
                try:
                    for proc in psutil.process_iter(["name"]):
                        if (proc.info.get("name") or "").casefold() in game_names:
                            found = True
                            break
                except Exception:
                    pass
                self._game_running_cache = found
                self._last_game_scan = now
            if self._game_running_cache:
                return
        self._last_auto = now
        threading.Thread(target=self.clean_processes, kwargs={"pids": None, "auto": True}, name="type0-auto-clean", daemon=True).start()

    def _reg_read(self, path, name):
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_READ) as key:
                value, kind = winreg.QueryValueEx(key, name)
                return {"exists": True, "value": value, "kind": kind}
        except FileNotFoundError:
            return {"exists": False}

    @staticmethod
    def _same_reg_value(check, original):
        if not original.get("exists"):
            return not check.get("exists")
        return bool(check.get("exists") and check.get("value") == original.get("value") and check.get("kind") == original.get("kind"))

    def _get_applied_tweak_ids(self):
        if sys.platform != "win32":
            return []
        try:
            import winreg
            applied = []
            for tweak_id, tweak in core.REG_TWEAKS.items():
                matches = True
                for path, name, target in tweak["values"]:
                    got = self._reg_read(path, name)
                    expected_kind = winreg.REG_SZ if isinstance(target, str) else winreg.REG_DWORD
                    if not got.get("exists") or got.get("value") != target or got.get("kind") != expected_kind:
                        matches = False
                        break
                if matches:
                    applied.append(tweak_id)
            return applied
        except Exception:
            core.write_crash_log("Could not inspect registry tweak state", sys.exc_info())
            return []

    def _load_registry_backup(self):
        try:
            value = json.loads(core.REG_BACKUP.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except Exception:
            return {}

    def _save_registry_backup(self, value):
        core.APPDIR.mkdir(parents=True, exist_ok=True)
        if not value:
            try:
                core.REG_BACKUP.unlink()
            except FileNotFoundError:
                pass
            return
        tmp = core.REG_BACKUP.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, core.REG_BACKUP)

    @staticmethod
    def _restore_registry_value(winreg, path, name, original):
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_SET_VALUE) as key:
                if not original.get("exists"):
                    try:
                        winreg.DeleteValue(key, name)
                    except FileNotFoundError:
                        pass
                else:
                    winreg.SetValueEx(key, name, 0, original["kind"], original["value"])
        except FileNotFoundError:
            if original.get("exists"):
                with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_SET_VALUE) as key:
                    winreg.SetValueEx(key, name, 0, original["kind"], original["value"])

    def _entries_for_tweak(self, tweak_id):
        return [path + "|" + name for path, name, _value in core.REG_TWEAKS[tweak_id]["values"]]

    def _broadcast_setting_change(self):
        if sys.platform != "win32":
            return
        try:
            user32 = ctypes.WinDLL("user32", use_last_error=True)
            hwnd_broadcast = 0xFFFF
            wm_settingchange = 0x001A
            smto_abortifhung = 0x0002
            result = ctypes.c_size_t()
            send = user32.SendMessageTimeoutW
            send.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_size_t, ctypes.c_void_p,
                             ctypes.c_uint, ctypes.c_uint, ctypes.POINTER(ctypes.c_size_t)]
            send.restype = ctypes.c_size_t
            for area in (r"Control Panel\Desktop", r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"):
                message = ctypes.cast(ctypes.c_wchar_p(area), ctypes.c_void_p)
                send(ctypes.c_void_p(hwnd_broadcast), wm_settingchange, 0, message, smto_abortifhung, 1500, ctypes.byref(result))
        except Exception:
            pass

    def _set_autostart(self, enable):
        if sys.platform != "win32":
            if enable:
                raise OSError("Автозагрузка доступна только в Windows.")
            return
        startup = self.startup_dir()
        startup.mkdir(parents=True, exist_ok=True)
        shortcut = startup / "type_0.lnk"
        # Remove old Run keys created by old type_0 builds to prevent duplicate launch.
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE) as key:
                for name in ("type_0", "MemPilotMAX"):
                    try:
                        winreg.DeleteValue(key, name)
                    except FileNotFoundError:
                        pass
        except FileNotFoundError:
            pass
        if not enable:
            try:
                shortcut.unlink()
            except FileNotFoundError:
                pass
            return
        if getattr(sys, "frozen", False):
            target = str(Path(sys.executable).resolve())
            args = ""
            work_dir = str(Path(target).parent)
            icon = f"{target},0"
        else:
            pyexe = Path(sys.executable)
            pyw = pyexe.with_name("pythonw.exe")
            target = str(pyw if pyw.exists() else pyexe)
            script = Path(__file__).with_name("webview_main.py").resolve()
            args = f'"{script}"'
            work_dir = str(script.parent)
            icon_path = core.resource_path("assets/type_0.ico")
            icon = f"{icon_path},0"
        def psq(v):
            return "'" + str(v).replace("'", "''") + "'"
        script = (
            "$ErrorActionPreference='Stop'; $ws=New-Object -ComObject WScript.Shell; "
            "$sc=$ws.CreateShortcut(" + psq(shortcut) + "); "
            "$sc.TargetPath=" + psq(target) + "; "
            "$sc.Arguments=" + psq(args) + "; "
            "$sc.WorkingDirectory=" + psq(work_dir) + "; "
            "$sc.IconLocation=" + psq(icon) + "; "
            "$sc.Description='type_0'; $sc.Save()"
        )
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True, text=True, timeout=15,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode != 0 or not shortcut.exists():
            detail = (result.stderr or result.stdout or "PowerShell did not create the shortcut").strip()
            raise OSError(f"Не удалось создать ярлык type_0: {detail}")

    def _ensure_tray(self):
        if not self.c.get("tray", True) or self._shutdown.is_set():
            return False
        if self._tray_icon is not None:
            return True
        try:
            import pystray
            from PIL import Image, ImageDraw, ImageFont
            icon_path = core.resource_path("assets/type_0-icon.png")
            if icon_path.exists():
                image = Image.open(icon_path).convert("RGBA").resize((64, 64), Image.Resampling.LANCZOS)
            else:
                image = Image.new("RGBA", (64, 64), (21, 42, 31, 255))
                draw = ImageDraw.Draw(image)
                try:
                    font = ImageFont.truetype("segoeuib.ttf", 38)
                except Exception:
                    font = ImageFont.load_default()
                draw.text((19, 6), "T", fill=(225, 241, 232, 255), font=font)
            menu = pystray.Menu(
                pystray.MenuItem("Открыть type_0", lambda icon, item: self.show_window(), default=True),
                pystray.MenuItem("Очистить рабочие наборы", lambda icon, item: self._tray_clean()),
                pystray.MenuItem("Выход", lambda icon, item: self._tray_exit()),
            )
            self._tray_icon = pystray.Icon("type_0", image, "type_0 · System Monitor", menu)
            self._tray_thread = threading.Thread(target=self._tray_icon.run, name="type0-tray", daemon=True)
            self._tray_thread.start()
            return True
        except Exception:
            self._tray_icon = None
            self._tray_thread = None
            core.write_crash_log("Tray initialization failed", sys.exc_info())
            return False

    def _stop_tray(self):
        icon, self._tray_icon = self._tray_icon, None
        if icon:
            try:
                icon.stop()
            except Exception:
                pass

    def _tray_clean(self):
        threading.Thread(target=self.clean_processes, kwargs={"pids": None, "auto": False}, name="type0-tray-clean", daemon=True).start()

    def _tray_exit(self):
        self._stop_tray()
        if self.window:
            self.window.destroy()
        self._shutdown.set()

    @staticmethod
    def program_dir():
        if getattr(sys, "frozen", False):
            return Path(sys.executable).resolve().parent
        return Path(__file__).resolve().parent

    @staticmethod
    def startup_dir():
        appdata = os.environ.get("APPDATA", str(Path.home()))
        return Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"


def enable_windows_dpi_awareness():
    if sys.platform != "win32":
        return
    try:
        user32 = ctypes.windll.user32
        try:
            if user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4)):
                return
        except Exception:
            pass
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
            return
        except Exception:
            pass
        try:
            user32.SetProcessDPIAware()
        except Exception:
            pass
    except Exception:
        pass
