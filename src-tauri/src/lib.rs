mod simplefin;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::Manager;

/// When the tray opens the quick-add window the app activates; without this
/// guard the macOS activation observer below would also pop the main window.
static SUPPRESS_NEXT_ACTIVATE: AtomicBool = AtomicBool::new(false);

/// Register a macOS observer for NSApplicationDidBecomeActiveNotification.
/// When the app is activated (notification click, Cmd+Tab, etc.), show and focus the main window.
/// This is necessary because RunEvent::Resumed only fires on mobile, not macOS desktop.
#[cfg(target_os = "macos")]
fn observe_app_activation(app_handle: tauri::AppHandle) {
  use block2::RcBlock;
  use objc2_foundation::{NSNotification, NSNotificationCenter, NSNotificationName, NSString};
  use std::ptr::NonNull;

  let name: &NSNotificationName =
    &*NSString::from_str("NSApplicationDidBecomeActiveNotification");

  let block = RcBlock::new(move |_notif: NonNull<NSNotification>| {
    if SUPPRESS_NEXT_ACTIVATE.swap(false, Ordering::SeqCst) {
      return;
    }
    if let Some(window) = app_handle.get_webview_window("main") {
      window.show().unwrap_or_default();
      window.set_focus().unwrap_or_default();
    }
  });

  unsafe {
    let center = NSNotificationCenter::defaultCenter();
    center.addObserverForName_object_queue_usingBlock(Some(name), None, None, &block);
  }

  // Leak the block so it lives for the app's lifetime
  std::mem::forget(block);
}

/// Show/hide the small quick-add capture window from the tray icon.
/// Created lazily on first use; afterwards it is only hidden, never closed.
fn toggle_quick_add(app: &tauri::AppHandle) {
  if let Some(window) = app.get_webview_window("quick-add") {
    if window.is_visible().unwrap_or(false) {
      window.hide().unwrap_or_default();
    } else {
      SUPPRESS_NEXT_ACTIVATE.store(true, Ordering::SeqCst);
      window.show().unwrap_or_default();
      window.set_focus().unwrap_or_default();
    }
  } else {
    SUPPRESS_NEXT_ACTIVATE.store(true, Ordering::SeqCst);
    let window = tauri::WebviewWindowBuilder::new(
      app,
      "quick-add",
      tauri::WebviewUrl::App("/quick-add".into()),
    )
    .title("Quick Add — Ledger")
    .inner_size(440.0, 640.0)
    .resizable(false)
    .always_on_top(true)
    .build();
    if let Ok(window) = window {
      window.set_focus().unwrap_or_default();
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_notification::init())
    .invoke_handler(tauri::generate_handler![
      simplefin::simplefin_link,
      simplefin::simplefin_is_linked,
      simplefin::simplefin_unlink,
      simplefin::simplefin_fetch_accounts
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // On macOS, observe app activation to show the window on notification click
      #[cfg(target_os = "macos")]
      observe_app_activation(app.handle().clone());

      // Menu-bar quick add: left-clicking the tray icon toggles a small capture window
      {
        use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
        TrayIconBuilder::with_id("ledger-tray")
          // Monochrome template glyph: macOS recolors it for light/dark menu bars
          .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?)
          .icon_as_template(true)
          .tooltip("Ledger — quick add")
          .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
              button: MouseButton::Left,
              button_state: MouseButtonState::Up,
              ..
            } = event
            {
              toggle_quick_add(tray.app_handle());
            }
          })
          .build(app)?;
      }

      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        // Hide the window instead of closing, so the app stays alive in the dock
        window.hide().unwrap_or_default();
        api.prevent_close();
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app_handle, event| {
    if let tauri::RunEvent::Reopen { .. } = event {
      // Re-show and focus the window when dock icon is clicked
      if let Some(window) = app_handle.get_webview_window("main") {
        window.show().unwrap_or_default();
        window.set_focus().unwrap_or_default();
      }
    }
  });
}
