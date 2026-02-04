use tauri::Manager;

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
      // Re-show and focus the window when the dock icon is clicked
      if let Some(window) = app_handle.get_webview_window("main") {
        window.show().unwrap_or_default();
        window.set_focus().unwrap_or_default();
      }
    }
  });
}
