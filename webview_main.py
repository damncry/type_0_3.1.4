# -*- coding: utf-8 -*-
"""Windows desktop launcher for type_0's static React UI."""
from __future__ import annotations

import ctypes
import os
import sys
import threading
import traceback
from pathlib import Path

import core_backend as core
from desktop_backend import DesktopAPI, enable_windows_dpi_awareness


def _install_exception_hooks():
    def handle(exc_type, exc, tb):
        core.write_crash_log("Uncaught application exception", (exc_type, exc, tb))
        try:
            if sys.platform == "win32":
                ctypes.windll.user32.MessageBoxW(
                    None,
                    "type_0 encountered an error.\n\nDetails were written to:\n"
                    + str(core.CRASHLOG),
                    "type_0",
                    0x10,
                )
        except Exception:
            pass

    sys.excepthook = handle
    if hasattr(threading, "excepthook"):
        def thread_handle(args):
            core.write_crash_log(
                f"Uncaught thread exception: {getattr(args.thread, 'name', 'unknown')}",
                (args.exc_type, args.exc_value, args.exc_traceback),
            )
        threading.excepthook = thread_handle


def _apply_windows_frame(title: str = "type_0"):
    """Enable native resize hit-testing and Win11 rounded corners for a frameless window."""
    if sys.platform != "win32":
        return
    try:
        user32 = ctypes.WinDLL("user32", use_last_error=True)
        user32.FindWindowW.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p]
        user32.FindWindowW.restype = ctypes.c_void_p
        hwnd = user32.FindWindowW(None, title)
        if not hwnd:
            return

        get_style = getattr(user32, "GetWindowLongPtrW", user32.GetWindowLongW)
        set_style = getattr(user32, "SetWindowLongPtrW", user32.SetWindowLongW)
        get_style.argtypes = [ctypes.c_void_p, ctypes.c_int]
        get_style.restype = ctypes.c_ssize_t
        set_style.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_ssize_t]
        set_style.restype = ctypes.c_ssize_t

        GWL_STYLE = -16
        WS_CAPTION = 0x00C00000
        WS_THICKFRAME = 0x00040000
        WS_MINIMIZEBOX = 0x00020000
        WS_MAXIMIZEBOX = 0x00010000
        WS_SYSMENU = 0x00080000
        style = int(get_style(hwnd, GWL_STYLE))
        style &= ~WS_CAPTION
        style |= WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU
        set_style(hwnd, GWL_STYLE, style)

        set_pos = user32.SetWindowPos
        set_pos.argtypes = [
            ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int, ctypes.c_int,
            ctypes.c_int, ctypes.c_int, ctypes.c_uint,
        ]
        set_pos.restype = ctypes.c_int
        SWP_NOSIZE = 0x0001
        SWP_NOMOVE = 0x0002
        SWP_NOZORDER = 0x0004
        SWP_NOACTIVATE = 0x0010
        SWP_FRAMECHANGED = 0x0020
        set_pos(hwnd, None, 0, 0, 0, 0,
                SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED)

        try:
            dwm = ctypes.WinDLL("dwmapi", use_last_error=True)
            value = ctypes.c_int(2)  # DWMWCP_ROUND
            dwm.DwmSetWindowAttribute.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_void_p, ctypes.c_uint]
            dwm.DwmSetWindowAttribute.restype = ctypes.c_long
            dwm.DwmSetWindowAttribute(hwnd, 33, ctypes.byref(value), ctypes.sizeof(value))
        except Exception:
            pass
    except Exception:
        core.write_crash_log("Could not apply Windows window frame", sys.exc_info())


def main():
    _install_exception_hooks()
    enable_windows_dpi_awareness()

    try:
        import webview
    except Exception:
        core.write_crash_log("Importing pywebview failed", sys.exc_info())
        raise RuntimeError(
            "Не удалось загрузить pywebview. Запусти build_exe.bat ещё раз "
            "или проверь файл crash.log."
        )

    # The exported UI runs locally; allow its CSV export and keep external links out of
    # the embedded webview. No remote web application is loaded by this app.
    try:
        webview.settings["ALLOW_FILE_URLS"] = True
        webview.settings["ALLOW_DOWNLOADS"] = True
        webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True
    except Exception:
        pass

    index = core.resource_path("out/index.html")
    if not index.is_file():
        raise FileNotFoundError(
            f"UI bundle not found: {index}\n"
            "Сначала собери интерфейс командой npm run build."
        )

    api = DesktopAPI()
    window = webview.create_window(
        title="type_0",
        url=index.resolve().as_uri(),
        width=1360,
        height=860,
        min_size=(900, 620),
        resizable=True,
        frameless=True,
        easy_drag=False,
        shadow=True,
        text_select=True,
        background_color="#0a0c0b",
        js_api=api,
    )
    api.attach_window(window)

    def on_started():
        try:
            api.startup()
            _apply_windows_frame("type_0")
        except Exception:
            core.write_crash_log("Desktop startup callback failed", sys.exc_info())

    try:
        webview.start(func=on_started, debug=False)
    except Exception:
        core.write_crash_log("pywebview event loop failed", sys.exc_info())
        raise
    finally:
        api.shutdown()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        core.write_crash_log("Fatal startup failure", sys.exc_info())
        if sys.platform == "win32":
            try:
                ctypes.windll.user32.MessageBoxW(
                    None,
                    "Не удалось запустить type_0.\n\nПодробности:\n" + str(core.CRASHLOG),
                    "type_0 · Ошибка запуска",
                    0x10,
                )
            except Exception:
                pass
        else:
            traceback.print_exc()
        sys.exit(1)
