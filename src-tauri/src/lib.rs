use tauri::Manager;
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .setup(|_app| {
      println!("CHRIS_LOG: Rust setup() completed");
      Ok(())
    })
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_http::init())
    .invoke_handler(tauri::generate_handler![
      commands::download_to_disk,
      commands::search_youtube_native_cmd,
      commands::get_streaming_url,
      commands::test_ytdlp
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
