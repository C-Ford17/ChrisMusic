use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::Duration;
#[cfg(any(desktop, mobile))]
use tauri_plugin_shell::ShellExt;
use log::{info, error};
use std::path::PathBuf;

fn get_cookies_path(app: &tauri::AppHandle) -> Option<String> {
    // 1. Try project root (for dev)
    let root_cookies = PathBuf::from("cookies.txt");
    if root_cookies.exists() {
        return Some(root_cookies.to_string_lossy().to_string());
    }

    // 2. Try app_data_dir
    if let Ok(app_dir) = app.path().app_data_dir() {
        let app_cookies = app_dir.join("cookies.txt");
        if app_cookies.exists() {
            return Some(app_cookies.to_string_lossy().to_string());
        }
    }

    // 3. Try bundled resources (for production)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled_cookies = resource_dir.join("cookies.txt");
        if bundled_cookies.exists() {
            return Some(bundled_cookies.to_string_lossy().to_string());
        }
    }

    None
}

#[tauri::command]
pub async fn save_cookies_cmd(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    let cookies_path = app_dir.join("cookies.txt");
    fs::write(&cookies_path, contents).map_err(|e| e.to_string())?;
    info!("CHRIS_LOG: Cookies saved to {:?}", cookies_path);
    Ok(())
}


#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    id: String,
    title: String,
    artist_name: String,
    thumbnail_url: String,
    source_type: String,
}

#[tauri::command]
pub async fn test_ytdlp(app: tauri::AppHandle) -> Result<String, String> {
    println!("CHRIS_LOG: TEST_YTDLP start");

    #[cfg(desktop)]
    println!("CHRIS_LOG: TEST_YTDLP platform=desktop");

    #[cfg(mobile)]
    println!("CHRIS_LOG: TEST_YTDLP platform=mobile");

    let sidecar = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| {
            let msg = format!("sidecar init failed: {}", e);
            error!("{}", msg);
            msg
        })?;

    println!("CHRIS_LOG: TEST_YTDLP sidecar created");

    let output = sidecar
        .args(["--version"])
        .output()
        .await
        .map_err(|e| {
            let msg = format!("sidecar spawn/output failed: {}", e);
            error!("{}", msg);
            msg
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    println!("CHRIS_LOG: TEST_YTDLP status={:?}", output.status);
    println!("CHRIS_LOG: TEST_YTDLP stdout={}", stdout);
    println!("CHRIS_LOG: TEST_YTDLP stderr={}", stderr);

    if output.status.success() {
        Ok(format!("yt-dlp ok: {}", stdout))
    } else {
        Err(format!(
            "yt-dlp failed. status={:?}, stderr={}",
            output.status, stderr
        ))
    }
}



#[tauri::command]
pub async fn search_youtube_native_cmd(app: tauri::AppHandle, query: String) -> Result<Vec<SearchResult>, String> {
    #[cfg(mobile)]
    let _ = app;
    println!("CHRIS_LOG: search_youtube_native called with query: {}", query);
    // --- STRATEGY 1: DESKTOP (High Power Extractor) ---
    #[cfg(desktop)]
    {
        println!("CHRIS_LOG: Searching via local yt-dlp extractor: {}", query);
        let search_query = format!("ytsearch10:{}", query);
        let cookies = get_cookies_path(&app);
        
        let clients = [
            "ios,android",
            "android_music,android",
            "tv_embedded,web_creator",
            "mweb",
            "web"
        ];

        for client in clients {
            let client_arg = format!("youtube:player_client={}", client);
            let mut args = vec![
                "--dump-json",
                "--flat-playlist",
                "--extractor-args",
                &client_arg,
                &search_query
            ];

            let cookies_val;
            if let Some(ref path) = cookies {
                cookies_val = path.clone();
                args.insert(0, "--cookies");
                args.insert(1, &cookies_val);
            }

            let sidecar_result = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?.args(&args).output().await;
            
            if let Ok(output) = sidecar_result {
                if output.status.success() {
                    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
                    let mut results = Vec::new();
                    for line in stdout.lines() {
                        if let Ok(item) = serde_json::from_str::<serde_json::Value>(line) {
                            let video_id = item["id"].as_str().unwrap_or_default().to_string();
                            let title = item["title"].as_str().unwrap_or_default().to_string();
                            let uploader = item["uploader"].as_str().or(item["channel"].as_str()).unwrap_or("Unknown").to_string();
                            let thumb = format!("https://img.youtube.com/vi/{}/mqdefault.jpg", video_id);
                            if !video_id.is_empty() {
                                results.push(SearchResult {
                                    id: video_id,
                                    title,
                                    artist_name: uploader,
                                    thumbnail_url: thumb,
                                    source_type: "youtube".to_string(),
                                });
                            }
                        }
                    }
                    if !results.is_empty() { return Ok(results); }
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    println!("CHRIS_LOG: Search failed for client {}: {}", client, stderr);
                }
            }
        }
    }

    // --- STRATEGY 2: UNIVERSAL (Invidious API Fallback for Mobile or when yt-dlp fails) ---
    let instances = [
        "https://inv.tux.digital",
        "https://invidious.ducks.cloud",
        "https://invidious.private.coffee",
        "https://vid.priv.au",
        "https://iv.melmac.space"
    ];

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10)) 
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    for instance in instances.iter() {
        let url = format!("{}/api/v1/search?q={}&type=video", instance, urlencoding::encode(&query));
        println!("CHRIS_LOG: Trying Invidious instance: {}", instance);
        match client.get(&url).send().await {
            Ok(res) => {
                if res.status().is_success() {
                    if let Ok(data) = res.json::<serde_json::Value>().await {
                        if let Some(items) = data.as_array() {
                            let mut results = Vec::new();
                            for item in items {
                                let video_id = item["videoId"].as_str().unwrap_or_default().to_string();
                                let title = item["title"].as_str().unwrap_or_default().to_string();
                                let uploader = item["author"].as_str().unwrap_or_default().to_string();
                                let thumb = format!("https://img.youtube.com/vi/{}/mqdefault.jpg", video_id);
                                if !video_id.is_empty() {
                                    results.push(SearchResult {
                                        id: video_id,
                                        title,
                                        artist_name: uploader,
                                        thumbnail_url: thumb,
                                        source_type: "youtube".to_string(),
                                    });
                                }
                            }
                            if !results.is_empty() { 
                                info!("Success with instance: {}", instance);
                                println!("CHRIS_LOG: Invidious results found: {}", results.len()); // Added this line based on the instruction's intent
                                return Ok(results); 
                            }
                        }
                    }
                }
            }
            Err(e) => {
                info!("Instance {} failed: {}", instance, e); // Kept original info! as `results.len()` is out of scope here
                continue;
            }
        }
    }

    println!("CHRIS_LOG: STRATEGY 2: INVIDIOUS FALLBACK for query: {}", query);
    Err("All search methods failed.".to_string())
}

#[tauri::command]
pub async fn get_streaming_url(app: tauri::AppHandle, video_id: String) -> Result<String, String> {
    #[cfg(mobile)]
    let _ = app;

    #[cfg(desktop)]
    {
        let cookies = get_cookies_path(&app);
        let clients = [
            "ios,android",
            "android_music,android",
            "tv_embedded,web_creator",
            "mweb",
            "web"
        ];

        for client in clients {
            let client_arg = format!("youtube:player_client={}", client);
            let video_url = format!("https://www.youtube.com/watch?v={}", video_id);
            let mut args = vec![
                "-g",
                "-f", "bestaudio[ext=m4a]/bestaudio/best",
                "--extractor-args",
                &client_arg,
                &video_url
            ];

            let cookies_val;
            if let Some(ref path) = cookies {
                cookies_val = path.clone();
                args.insert(0, "--cookies");
                args.insert(1, &cookies_val);
            }

            let sidecar_result = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?.args(&args).output().await;

            if let Ok(output) = sidecar_result {
                if output.status.success() {
                    return Ok(String::from_utf8(output.stdout)
                        .map_err(|e| e.to_string())?
                        .trim()
                        .to_string());
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    error!("yt-dlp failed for client {} with stderr: {}", client, stderr);
                }
            }
        }
    }

    // Fallback: Invidious para Mobile (y cuando yt-dlp falla en desktop)
    let instances = ["https://yewtu.be", "https://iv.melmac.space", "https://inv.tux.digital", "https://iv.ggtyler.dev"];

    let mobile_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| format!("client build failed: {}", e))?;

    for instance in instances.iter() {
        let url = format!("{}/api/v1/videos/{}", instance, video_id);
        println!("CHRIS_LOG: Getting streaming URL from: {}", instance);

        if let Ok(res) = mobile_client.get(&url).send().await {
            if let Ok(data) = res.json::<serde_json::Value>().await {
                if let Some(formats) = data["adaptiveFormats"].as_array() {
                    for format in formats {
                        if format["type"].as_str().unwrap_or("").contains("audio") {
                            if let Some(stream_url) = format["url"].as_str() {
                                return Ok(stream_url.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    Err("Could not extract stream URL.".to_string())
}


#[tauri::command]
pub async fn download_to_disk(app: tauri::AppHandle, _video_id: String, _title: String, is_cache: Option<bool>) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let folder = if is_cache.unwrap_or(false) { "cache" } else { "downloads" };
    let target_dir = app_dir.join(folder);
    if !target_dir.exists() { fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?; }
    #[cfg(mobile)]
    { return Err("Downloads are currently desktop-only.".to_string()); }
    #[cfg(desktop)]
    {
        let target_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join(if is_cache.unwrap_or(false) { "cache" } else { "downloads" });
        if !target_dir.exists() { fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?; }
        
        let output_str = target_dir.join(format!("{}.%(ext)s", _video_id)).to_string_lossy().to_string();
        let cookies = get_cookies_path(&app);
        
        let clients = [
            "ios,android",
            "android_music,android",
            "tv_embedded,web_creator",
            "mweb",
            "web"
        ];

        for client in clients {
            let client_arg = format!("youtube:player_client={}", client);
            let video_url = format!("https://www.youtube.com/watch?v={}", _video_id);
            let mut args = vec![
                "--js-runtimes", "node",
                "-f", "bestaudio/best",
                "--force-overwrites",
                "--no-continue",
                "--extractor-args", &client_arg,
                "-o", &output_str,
                &video_url
            ];

            let cookies_val;
            if let Some(ref path) = cookies {
                cookies_val = path.clone();
                args.insert(0, "--cookies");
                args.insert(1, &cookies_val);
            }

            let sidecar_result = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?.args(&args).output().await;

            if let Ok(output) = sidecar_result {
                if output.status.success() {
                    if let Ok(entries) = fs::read_dir(&target_dir) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if let Some(name) = path.file_name() {
                                let name_str = name.to_string_lossy();
                                if name_str.starts_with(&_video_id) && !name_str.ends_with(".part") {
                                    return Ok(path.to_string_lossy().to_string());
                                }
                            }
                        }
                    }
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    error!("Download failed for client {}: {}", client, stderr);
                }
            }
        }
        Err("Download failed after trying all clients".to_string())
    }
}
