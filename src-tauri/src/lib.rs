use tauri::Manager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_notification::init())
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
    match event {
      tauri::RunEvent::Reopen { .. } => {
        // Re-show and focus the window when dock icon is clicked
        if let Some(window) = app_handle.get_webview_window("main") {
          window.show().unwrap_or_default();
          window.set_focus().unwrap_or_default();
        }
      }
      _ => {}
    }
  });
}
