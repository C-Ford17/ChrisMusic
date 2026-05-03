use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::Duration;
#[cfg(any(desktop, mobile))]
use tauri_plugin_shell::ShellExt;
use std::sync::Mutex;
use std::sync::OnceLock;
use log::{info, error, warn};
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


fn parse_view_count(text: &str) -> u64 {
    let cleaned = text.replace("reproducciones", "").replace("visualizaciones", "").replace("views", "").trim().to_string();
    let parts: Vec<&str> = cleaned.split_whitespace().collect();
    if parts.is_empty() { return 0; }
    
    let num_str = parts[0].replace(',', ".");
    let multiplier = if parts.len() > 1 {
        match parts[1].to_uppercase().as_str() {
            "M" | "MILLONES" => 1_000_000,
            "K" | "MIL" => 1_000,
            "B" | "MIL MILLONES" => 1_000_000_000,
            _ => 1,
        }
    } else { 1 };

    (num_str.parse::<f64>().unwrap_or(0.0) * multiplier as f64) as u64
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub artist_name: String,
    pub thumbnail_url: String,
    pub source_type: String,
    pub result_type: String, // "song", "album", "artist"
    pub name: Option<String>,
    pub is_explicit: Option<bool>,
    pub duration_text: Option<String>,
    pub view_count_text: Option<String>,
    pub view_count: Option<u64>,
    pub raw_info: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub continuation: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistDetails {
    id: String,
    name: String,
    thumbnail_url: String,
    biography: Option<String>,
    top_songs: Vec<SearchResult>,
    albums: Vec<SearchResult>,
    singles: Vec<SearchResult>,
    playlists: Vec<SearchResult>,
}

#[tauri::command]
pub async fn get_song_details_cmd(video_id: String, proxy: Option<String>, doh: Option<String>, ipv4: Option<bool>) -> Result<SearchResult, String> {
    let _ = doh;
    println!("CHRIS_LOG: get_song_details_cmd for {} (ipv4: {:?})", video_id, ipv4);
    let body = serde_json::json!({
        "context": get_innertube_context(),
        "videoId": video_id
    });

    if let Ok(data) = innertube_request("next", body, proxy, ipv4).await {
        let mut panel = &data["contents"]["singleColumnMusicWatchNextResultsRenderer"]["tabbedRenderer"]["watchNextTabRenderer"]["content"]["musicQueueRenderer"]["content"]["playlistPanelRenderer"];
        
        // Try alternate path for certain videos/regions
        if panel.is_null() {
            panel = &data["contents"]["singleColumnMusicWatchNextResultsRenderer"]["tabbedRenderer"]["watchNextTabbedResultsRenderer"]["tabs"][0]["tabRenderer"]["content"]["musicQueueRenderer"]["content"]["playlistPanelRenderer"];
        }

        // Find the video in the queue panel
        let video_entry = panel["contents"].as_array()
            .and_then(|c| c.iter().find(|x| x["playlistPanelVideoRenderer"]["videoId"].as_str() == Some(&video_id)))
            .map(|x| &x["playlistPanelVideoRenderer"])
            .or_else(|| {
                let first = &panel["contents"][0]["playlistPanelVideoRenderer"];
                if !first.is_null() { Some(first) } else { None }
            });

        if let Some(v) = video_entry {
            let title = v["title"]["runs"][0]["text"].as_str().unwrap_or_default().to_string();
            let artist = v["longBylineText"]["runs"][0]["text"].as_str()
                .or_else(|| v["shortBylineText"]["runs"][0]["text"].as_str())
                .unwrap_or_default().to_string();
            let thumb = v["thumbnail"]["thumbnails"].as_array()
                .and_then(|t| t.last())
                .and_then(|t| t["url"].as_str())
                .unwrap_or_default().to_string();
            let duration_text = v["lengthText"]["runs"][0]["text"].as_str().map(|s| s.to_string());

            return Ok(SearchResult {
                id: video_id.clone(),
                title,
                artist_name: artist,
                thumbnail_url: if thumb.is_empty() { format!("https://img.youtube.com/vi/{}/mqdefault.jpg", video_id) } else { thumb },
                source_type: "youtube".to_string(),
                result_type: "song".to_string(),
                name: None, is_explicit: None, duration_text, view_count_text: None, view_count: None, raw_info: None,
            });
        }
    }
    Err("Could not fetch song details from InnerTube".to_string())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumDetails {
    id: String,
    title: String,
    artist_name: String,
    thumbnail_url: String,
    songs: Vec<SearchResult>,
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

static LAST_WORKING_CLIENT_INDEX: OnceLock<Mutex<usize>> = OnceLock::new();
static LAST_WORKING_INSTANCE_INDEX: OnceLock<Mutex<usize>> = OnceLock::new();

fn get_last_client_index() -> usize {
    *LAST_WORKING_CLIENT_INDEX.get_or_init(|| Mutex::new(0)).lock().unwrap()
}

fn set_last_client_index(index: usize) {
    *LAST_WORKING_CLIENT_INDEX.get_or_init(|| Mutex::new(0)).lock().unwrap() = index;
}

fn get_last_instance_index() -> usize {
    *LAST_WORKING_INSTANCE_INDEX.get_or_init(|| Mutex::new(0)).lock().unwrap()
}

fn set_last_instance_index(index: usize) {
    *LAST_WORKING_INSTANCE_INDEX.get_or_init(|| Mutex::new(0)).lock().unwrap() = index;
}

#[tauri::command]
pub async fn search_youtube_native_cmd(
    app: tauri::AppHandle, 
    query: String, 
    count: Option<u32>, 
    filter: Option<String>, 
    continuation: Option<String>,
    proxy: Option<String>,
    doh: Option<String>,
    ipv4: Option<bool>
) -> Result<SearchResponse, String> {
    #[cfg(mobile)]
    let _ = app;
    let limit = count.unwrap_or(15);
    let filter_val = filter.unwrap_or("song".to_string());
    
    // --- STRATEGY 1: InnerTube Search (High Precision) ---
    let body = if let Some(token) = continuation {
        serde_json::json!({
            "context": get_innertube_context(),
            "continuation": token
        })
    } else {
        // Correct ytmusicapi params for WEB_REMIX filtered search
        let params = match filter_val.as_str() {
            "artist"   => "EgWKAQIgAWoMEAMQDhAKEAkQBRAV",
            "album"    => "EgWKAQIYAWoMEAMQDhAKEAkQBRAV",
            "song"     => "EgWKAQIIAWoMEAMQDhAKEAkQBRAV",
            "playlist" => "EgWKAQIoAWoMEAMQDhAKEAkQBRAV",
            _          => "",
        };
        if params.is_empty() {
            serde_json::json!({ "context": get_innertube_context(), "query": query })
        } else {
            serde_json::json!({ "context": get_innertube_context(), "query": query, "params": params })
        }
    };

    println!("CHRIS_LOG: InnerTube search filter_val={} with params (ipv4: {:?})", filter_val, ipv4);

    if let Ok(data) = innertube_request("search", body, proxy.clone(), ipv4).await {
        let mut results = Vec::new();
        // Filtered searches use tabbedSearchResultsRenderer; continuations use a flat structure
        let root = if data["contents"]["tabbedSearchResultsRenderer"].is_object() {
            data["contents"]["tabbedSearchResultsRenderer"]["tabs"][0]["tabRenderer"]["content"].clone()
        } else {
            data["continuationContents"].clone()
        };
        let mut queue = vec![if root.is_null() { data.clone() } else { root }];
        let mut seen_ids = std::collections::HashSet::new();
        let mut next_continuation = None;

        while let Some(current) = queue.pop() {
            if let Some(obj) = current.as_object() {
                // 1. Look for continuation token in shelf-specific paths
                if let Some(renderer) = obj.get("musicShelfRenderer") {
                    if let Some(items) = renderer["contents"].as_array() {
                        queue.extend(items.iter().rev().cloned());
                    }
                    if let Some(conts) = renderer["continuations"].as_array() {
                        if let Some(token) = conts[0]["nextContinuationData"]["continuation"].as_str() {
                            next_continuation = Some(token.to_string());
                        }
                    }
                } else if let Some(renderer) = obj.get("continuationItemRenderer") {
                    if let Some(token) = renderer["continuationEndpoint"]["continuationCommand"]["token"].as_str() {
                        next_continuation = Some(token.to_string());
                    }
                } else if let Some(cont) = obj.get("nextContinuationData") {
                    if let Some(token) = cont["continuation"].as_str() {
                        next_continuation = Some(token.to_string());
                    }
                } else if let Some(renderer) = obj.get("musicCardShelfRenderer") {
                    if let Some(items) = renderer["contents"].as_array() {
                        queue.extend(items.iter().rev().cloned());
                    }
                } else if let Some(renderer) = obj.get("musicResponsiveListItemRenderer") {
                    let flex_cols = renderer["flexColumns"].as_array();
                    let title = flex_cols.and_then(|c| c.get(0)).and_then(|c| c["musicResponsiveListItemFlexColumnRenderer"]["text"]["runs"].as_array()).and_then(|r| r.get(0)).and_then(|r| r["text"].as_str()).unwrap_or_default().to_string();
                    
                    let video_id = renderer["playlistItemData"]["videoId"].as_str()
                        .or(renderer["navigationEndpoint"]["watchEndpoint"]["videoId"].as_str())
                        .unwrap_or_default().to_string();
                    
                    let browse_id = renderer["navigationEndpoint"]["browseEndpoint"]["browseId"].as_str().unwrap_or_default().to_string();
                    
                    let mut artist_name = "Unknown Artist".to_string();
                    let mut duration_text = None;
                    let mut actual_type = "song".to_string();
                    let mut view_count_text = None;

                    // METADATA & TYPE DETECTION
                    if let Some(cols) = flex_cols {
                        for col in cols {
                            if let Some(runs) = col["musicResponsiveListItemFlexColumnRenderer"]["text"]["runs"].as_array() {
                                for run in runs {
                                    if let Some(text) = run["text"].as_str() {
                                        let trimmed = text.trim();
                                        let lower = trimmed.to_lowercase();
                                        if lower == "canción" || lower == "song" { actual_type = "song".to_string(); }
                                        else if lower == "vídeo" || lower == "video" { actual_type = "video".to_string(); }
                                        else if lower == "álbum" || lower == "album" { actual_type = "album".to_string(); }
                                        else if lower == "artista" || lower == "artist" { actual_type = "artist".to_string(); }
                                        else if lower == "lista de reproducción" || lower == "playlist" { actual_type = "playlist".to_string(); }
                                        else if duration_text.is_none() && trimmed.contains(':') && trimmed.chars().all(|c| c.is_numeric() || c == ':' || c.is_whitespace()) {
                                            duration_text = Some(trimmed.to_string());
                                        } else if trimmed.contains("reproducciones") || trimmed.contains("visualizaciones") || trimmed.contains("views") {
                                            view_count_text = Some(trimmed.to_string());
                                        } else if let Some(b_id) = run["navigationEndpoint"]["browseEndpoint"]["browseId"].as_str() {
                                            if b_id.starts_with("UC") || b_id.starts_with("FMr") {
                                                artist_name = trimmed.to_string();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // BACKEND FILTERING — only hard-filter when explicitly requested
                    if filter_val == "album" && actual_type != "album" { continue; }
                    if filter_val == "artist" && actual_type != "artist" { continue; }
                    // For song filter, skip albums and artists but keep songs, videos, playlists
                    if filter_val == "song" && (actual_type == "album" || actual_type == "artist") { continue; }

                    if !video_id.is_empty() && !seen_ids.contains(&video_id) {
                        let view_count = view_count_text.as_ref().map(|s| parse_view_count(s));
                        results.push(SearchResult {
                            id: video_id.clone(),
                            title: title.clone(),
                            artist_name: artist_name.clone(),
                            thumbnail_url: format!("https://img.youtube.com/vi/{}/mqdefault.jpg", video_id),
                            source_type: "youtube".to_string(),
                            result_type: actual_type,
                            name: None,
                            is_explicit: Some(false),
                            duration_text,
                            view_count_text,
                            view_count,
                            raw_info: Some(renderer.to_string()),
                        });
                        seen_ids.insert(video_id);
                    } else if !browse_id.is_empty() && !seen_ids.contains(&browse_id) {
                         let thumb = renderer["thumbnail"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"]
                            .as_array().and_then(|t| t.last()).and_then(|t| t["url"].as_str()).unwrap_or_default().to_string();

                         results.push(SearchResult {
                            id: browse_id.clone(),
                            title: title.clone(),
                            artist_name,
                            thumbnail_url: thumb,
                            source_type: "youtube".to_string(),
                            result_type: actual_type,
                            name: Some(title),
                            is_explicit: None, duration_text: None, view_count_text: None, view_count: None,
                            raw_info: Some(renderer.to_string()),
                        });
                        seen_ids.insert(browse_id);
                    }
                } else if let Some(renderer) = obj.get("musicTwoRowItemRenderer") {
                    let title = renderer["title"]["runs"][0]["text"].as_str().unwrap_or_default().to_string();
                    let browse_id = renderer["navigationEndpoint"]["browseEndpoint"]["browseId"].as_str().unwrap_or_default().to_string();
                    if !browse_id.is_empty() && !seen_ids.contains(&browse_id) {
                        let is_artist   = browse_id.starts_with("UC") || browse_id.starts_with("FMr");
                        let is_playlist = browse_id.starts_with("VL") || browse_id.starts_with("PL") || browse_id.starts_with("RDCL");
                        let res_type = if is_artist { "artist" } else if is_playlist { "playlist" } else { "album" };

                        // Only keep items that match the requested filter
                        if filter_val == "album"   && res_type != "album"    { seen_ids.insert(browse_id); continue; }
                        if filter_val == "artist"  && res_type != "artist"   { seen_ids.insert(browse_id); continue; }
                        if filter_val == "playlist"&& res_type != "playlist" { seen_ids.insert(browse_id); continue; }
                        if filter_val == "song"    && (res_type == "album" || res_type == "artist") { seen_ids.insert(browse_id); continue; }

                        // Artist name: from subtitle runs that link to an artist channel
                        let mut artist_name = title.clone();
                        if !is_artist {
                            if let Some(runs) = renderer["subtitle"]["runs"].as_array() {
                                for run in runs {
                                    if let Some(b_id) = run["navigationEndpoint"]["browseEndpoint"]["browseId"].as_str() {
                                        if b_id.starts_with("UC") || b_id.starts_with("FMr") {
                                            artist_name = run["text"].as_str().unwrap_or(&artist_name).to_string();
                                        }
                                    } else if let Some(text) = run["text"].as_str() {
                                        // For playlists the subtitle may just be plain text (e.g. "Playlist • 50 songs")
                                        if is_playlist && artist_name == title && !text.trim().is_empty() && text.trim() != "•" {
                                            // Use the first non-bullet subtitle token as the "artist" (playlist owner)
                                            artist_name = text.trim().to_string();
                                        }
                                    }
                                }
                            }
                        }

                        let thumb = renderer["thumbnailRenderer"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"]
                            .as_array().and_then(|t| t.last()).and_then(|t| t["url"].as_str()).unwrap_or_default().to_string();

                        results.push(SearchResult {
                            id: browse_id.clone(),
                            title: title.clone(),
                            artist_name,
                            thumbnail_url: thumb,
                            source_type: "youtube".to_string(),
                            result_type: res_type.to_string(),
                            name: if is_artist { Some(title) } else { None },
                            is_explicit: None, duration_text: None, view_count_text: None, view_count: None,
                            raw_info: Some(renderer.to_string()),
                        });
                        seen_ids.insert(browse_id);
                    }
                } else {
                    for (_, val) in obj {
                        if val.is_object() || val.is_array() { queue.push(val.clone()); }
                    }
                }
            } else if let Some(arr) = current.as_array() {
                for val in arr { queue.push(val.clone()); }
            }
            if results.len() >= 100 { break; }
        }
        if !results.is_empty() { 
            return Ok(SearchResponse { results, continuation: next_continuation }); 
        }
    }

    // --- STRATEGY 2: DESKTOP (yt-dlp Fallback) ---
    #[cfg(desktop)]
    {
        let search_query = if filter_val == "album" {
            format!("ytsearch{}:{} album", limit, query)
        } else if filter_val == "artist" {
            format!("ytsearch{}:{} artist", limit, query)
        } else {
            format!("ytsearch{}:{}", limit, query)
        };

        let cookies = get_cookies_path(&app);
        let clients = ["ios,android", "android_music,android", "tv_embedded,web_creator", "mweb", "web"];
        let last_index = get_last_client_index();
        let mut client_indices: Vec<usize> = (0..clients.len()).collect();
        if last_index < clients.len() {
            client_indices.retain(|&i| i != last_index);
            client_indices.insert(0, last_index);
        }

        for &i in &client_indices {
            let client = clients[i];
            let client_arg = format!("youtube:player_client={}", client);
            let mut args = vec!["--dump-json", "--flat-playlist", "--extractor-args", &client_arg, &search_query];
            
            let proxy_val;
            if let Some(ref p) = proxy {
                if !p.is_empty() {
                    proxy_val = p.clone();
                    args.insert(0, "--proxy");
                    args.insert(1, &proxy_val);
                }
            }

            let doh_val;
            if let Some(ref d) = doh {
                if !d.is_empty() {
                    doh_val = d.clone();
                    args.insert(0, "--dns-over-https");
                    args.insert(1, &doh_val);
                }
            }

            let cookies_val;
            if let Some(ref path) = cookies {
                cookies_val = path.clone();
                args.insert(0, "--cookies");
                args.insert(1, &cookies_val);
            }

            if let Ok(output) = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?.args(&args).output().await {
                if output.status.success() {
                    set_last_client_index(i);
                    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
                    let mut results = Vec::new();
                    let mut seen_ids = std::collections::HashSet::new();

                    for line in stdout.lines() {
                        if let Ok(item) = serde_json::from_str::<serde_json::Value>(line) {
                            let video_id = item["id"].as_str().unwrap_or_default().to_string();
                            if !video_id.is_empty() && !seen_ids.contains(&video_id) {
                                results.push(SearchResult {
                                    id: video_id.clone(),
                                    title: item["title"].as_str().unwrap_or_default().to_string(),
                                    artist_name: item["uploader"].as_str().or(item["channel"].as_str()).unwrap_or("Unknown").to_string(),
                                    thumbnail_url: format!("https://img.youtube.com/vi/{}/mqdefault.jpg", video_id),
                                    source_type: "youtube".to_string(),
                                    result_type: if filter_val == "album" { "album".to_string() } else if filter_val == "artist" { "artist".to_string() } else { "song".to_string() },
                                    name: if filter_val == "artist" { Some(item["uploader"].as_str().unwrap_or_default().to_string()) } else { None },
                                    is_explicit: None,
                                    duration_text: None,
                                    view_count_text: None,
                                    view_count: None,
                                    raw_info: None,
                                });
                                seen_ids.insert(video_id);
                            }
                        }
                    }
                    if !results.is_empty() { 
                        return Ok(SearchResponse { results, continuation: None }); 
                    }
                }
            }
        }
    }

    Err("All search methods failed (InnerTube & yt-dlp).".to_string())
}

// --- INNERTUBE UTILS ---
async fn innertube_request(endpoint: &str, body: serde_json::Value, proxy: Option<String>, ipv4: Option<bool>) -> Result<serde_json::Value, String> {
    let mut builder = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(15));

    if let Some(true) = ipv4 {
        builder = builder.ip_strategy(reqwest::dns::IpStrategy::Ipv4Only);
    }

    if let Some(p_url) = proxy {
        if !p_url.is_empty() {
            builder = builder.proxy(reqwest::Proxy::all(p_url).map_err(|e| e.to_string())?);
        }
    }

    let client = builder.build().map_err(|e| e.to_string())?;

    let url = format!("https://music.youtube.com/youtubei/v1/{}", endpoint);
    let res = client.post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        res.json::<serde_json::Value>().await.map_err(|e| e.to_string())
    } else {
        Err(format!("InnerTube error: {}", res.status()))
    }
}

fn get_innertube_context() -> serde_json::Value {
    serde_json::json!({
        "client": {
            "clientName": "WEB_REMIX",
            "clientVersion": "1.20241028.01.00",
            "hl": "es",
            "gl": "US"
        }
    })
}

#[tauri::command]
pub async fn get_artist_details_cmd(app: tauri::AppHandle, artist_id: String, proxy: Option<String>, doh: Option<String>, ipv4: Option<bool>) -> Result<ArtistDetails, String> {
    let _ = doh;
    println!("CHRIS_LOG: get_artist_details_cmd for {} (ipv4: {:?})", artist_id, ipv4);
    let _ = app;

    let body = serde_json::json!({
        "context": get_innertube_context(),
        "browseId": artist_id
    });

    let mut artist_name = "Unknown Artist".to_string();
    let mut thumbnail_url = "".to_string();
    let mut biography = None;
    let mut top_songs: Vec<SearchResult> = Vec::new();
    let mut albums: Vec<SearchResult> = Vec::new();
    let mut singles: Vec<SearchResult> = Vec::new();
    let mut playlists: Vec<SearchResult> = Vec::new();

    if let Ok(data) = innertube_request("browse", body, proxy, ipv4).await {
        // --- HEADER ---
        let header = data["header"]["musicImmersiveHeaderRenderer"].as_object()
            .or_else(|| data["header"]["musicVisualHeaderRenderer"].as_object());
        if let Some(h) = header {
            artist_name = h["title"]["runs"][0]["text"].as_str().unwrap_or("Unknown Artist").to_string();
            thumbnail_url = h["thumbnail"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"]
                .as_array().and_then(|t| t.last()).and_then(|t| t["url"].as_str()).unwrap_or_default().to_string();
        }

        // --- SECTIONS ---
        let sections = data["contents"]["singleColumnBrowseResultsRenderer"]["tabs"][0]
            ["tabRenderer"]["content"]["sectionListRenderer"]["contents"].as_array();

        if let Some(sections) = sections {
            for section in sections {
                // Bio
                if let Some(desc_shelf) = section["musicDescriptionShelfRenderer"].as_object() {
                    if let Some(runs) = desc_shelf["description"]["runs"].as_array() {
                        let bio: String = runs.iter()
                            .filter_map(|r| r["text"].as_str())
                            .collect::<Vec<_>>().join("");
                        if !bio.is_empty() { biography = Some(bio); }
                    }
                    continue;
                }

                // Top songs shelf
                if let Some(shelf) = section["musicShelfRenderer"].as_object() {
                    if let Some(items) = shelf["contents"].as_array() {
                        for item in items {
                            let r = &item["musicResponsiveListItemRenderer"];
                            if r.is_null() { continue; }
                            let title = r["flexColumns"][0]["musicResponsiveListItemFlexColumnRenderer"]["text"]["runs"][0]["text"]
                                .as_str().unwrap_or_default().to_string();
                            // videoId from overlay (most reliable) or flexColumn watchEndpoint
                            let video_id = r["overlay"]["musicItemThumbnailOverlayRenderer"]["content"]["musicPlayButtonRenderer"]["playNavigationEndpoint"]["watchEndpoint"]["videoId"]
                                .as_str()
                                .or_else(|| r["flexColumns"][0]["musicResponsiveListItemFlexColumnRenderer"]["text"]["runs"][0]["navigationEndpoint"]["watchEndpoint"]["videoId"].as_str())
                                .unwrap_or_default().to_string();
                            if video_id.is_empty() || title.is_empty() { continue; }
                            let is_explicit = r["badges"].as_array()
                                .map(|b| b.iter().any(|badge| badge["musicInlineBadgeRenderer"]["icon"]["iconType"].as_str() == Some("MUSIC_EXPLICIT_BADGE")))
                                .unwrap_or(false);
                            top_songs.push(SearchResult {
                                id: video_id.clone(),
                                title,
                                artist_name: artist_name.clone(),
                                thumbnail_url: format!("https://img.youtube.com/vi/{}/mqdefault.jpg", video_id),
                                source_type: "youtube".to_string(),
                                result_type: "song".to_string(),
                                name: None, is_explicit: Some(is_explicit),
                                duration_text: None, view_count_text: None, view_count: None,
                                raw_info: None,
                            });
                        }
                    }
                    continue;
                }

                // Carousel shelves: Álbumes, Singles, Playlists, etc.
                if let Some(carousel) = section["musicCarouselShelfRenderer"].as_object() {
                    let section_title = carousel["header"]["musicCarouselShelfBasicHeaderRenderer"]["title"]["runs"][0]["text"]
                        .as_str().unwrap_or("").to_lowercase();
                    let target: &mut Vec<SearchResult> = if section_title.contains("lbum") {
                        &mut albums
                    } else if section_title.contains("single") || section_title.contains("ep") {
                        &mut singles
                    } else if section_title.contains("lista") || section_title.contains("playlist") {
                        &mut playlists
                    } else {
                        continue; // skip Videos, Actuaciones, etc.
                    };

                    if let Some(items) = carousel["contents"].as_array() {
                        for item in items {
                            let r = &item["musicTwoRowItemRenderer"];
                            if r.is_null() { continue; }
                            let item_title = r["title"]["runs"][0]["text"].as_str().unwrap_or_default().to_string();
                            let browse_id = r["navigationEndpoint"]["browseEndpoint"]["browseId"]
                                .as_str().unwrap_or_default().to_string();
                            if item_title.is_empty() || browse_id.is_empty() { continue; }
                            let thumb = r["thumbnailRenderer"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"]
                                .as_array().and_then(|t| t.last()).and_then(|t| t["url"].as_str()).unwrap_or_default().to_string();
                            // Subtitle (year, song count, etc.)
                            let subtitle = r["subtitle"]["runs"].as_array()
                                .map(|runs| runs.iter().filter_map(|r| r["text"].as_str()).collect::<Vec<_>>().join(""))
                                .unwrap_or_default();
                            let res_type = if section_title.contains("lbum") { "album" } 
                                else if section_title.contains("single") || section_title.contains("ep") { "album" }
                                else { "playlist" };
                            target.push(SearchResult {
                                id: browse_id.clone(),
                                title: item_title.clone(),
                                artist_name: artist_name.clone(),
                                thumbnail_url: thumb,
                                source_type: "youtube".to_string(),
                                result_type: res_type.to_string(),
                                name: Some(item_title),
                                is_explicit: None,
                                duration_text: if subtitle.is_empty() { None } else { Some(subtitle) },
                                view_count_text: None, view_count: None,
                                raw_info: None,
                            });
                        }
                    }
                }
            }
        }
    }

    if artist_name != "Unknown Artist" || !top_songs.is_empty() {
        Ok(ArtistDetails { id: artist_id, name: artist_name, thumbnail_url, biography, top_songs, albums, singles, playlists })
    } else {
        Err("Could not retrieve artist details".to_string())
    }
}

#[tauri::command]
pub async fn get_album_details_cmd(app: tauri::AppHandle, album_id: String, proxy: Option<String>, doh: Option<String>, ipv4: Option<bool>) -> Result<AlbumDetails, String> {
    let _ = doh;
    println!("CHRIS_LOG: get_album_details_cmd for {} (ipv4: {:?})", album_id, ipv4);
    let _ = app;

    let body = serde_json::json!({ "context": get_innertube_context(), "browseId": album_id });

    if let Ok(data) = innertube_request("browse", body, proxy, ipv4).await {
        let mut title = "Unknown Album".to_string();
        let mut artist = "Unknown Artist".to_string();
        let mut thumb = "".to_string();

        // The real header is inside tabs[0] -> musicResponsiveHeaderRenderer
        let header = &data["contents"]["twoColumnBrowseResultsRenderer"]["tabs"][0]
            ["tabRenderer"]["content"]["sectionListRenderer"]["contents"][0]
            ["musicResponsiveHeaderRenderer"];

        println!("CHRIS_LOG: musicResponsiveHeaderRenderer present: {}", !header.is_null());

        if !header.is_null() {
            // Title
            if let Some(t) = header["title"]["runs"][0]["text"].as_str() {
                title = t.to_string();
            }
            // Artist — straplineTextOne has the artist with browseId
            if let Some(runs) = header["straplineTextOne"]["runs"].as_array() {
                for run in runs {
                    if let Some(text) = run["text"].as_str() {
                        if !text.trim().is_empty() && text.trim() != "•" {
                            artist = text.trim().to_string();
                            break;
                        }
                    }
                }
            }
            // Thumbnail
            if let Some(thumbs) = header["thumbnail"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"].as_array() {
                if let Some(last) = thumbs.last().and_then(|t| t["url"].as_str()) {
                    thumb = last.to_string();
                }
            }
            // If still no artist (playlists don't have straplineTextOne), try microformat
            if artist == "Unknown Artist" {
                if let Some(owner) = data["microformat"]["microformatDataRenderer"]["pageOwnerDetails"]["name"].as_str() {
                    if !owner.is_empty() { artist = owner.to_string(); }
                }
            }
            println!("CHRIS_LOG: album parsed — title: {}, artist: {}, thumb_empty: {}", title, artist, thumb.is_empty());
        } else {
            // Fallback: try microformat for title
            if let Some(mf_title) = data["microformat"]["microformatDataRenderer"]["title"].as_str() {
                // Format is "Album Title - Álbum de Artist Name"
                if let Some(idx) = mf_title.find(" - ") {
                    title = mf_title[..idx].to_string();
                } else {
                    title = mf_title.to_string();
                }
            }
            // Fallback: artist from pageOwnerDetails
            if let Some(owner) = data["microformat"]["microformatDataRenderer"]["pageOwnerDetails"]["name"].as_str() {
                if !owner.is_empty() { artist = owner.to_string(); }
            }
            // Fallback: background thumbnail
            if let Some(thumbs) = data["background"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"].as_array() {
                if let Some(last) = thumbs.last().and_then(|t| t["url"].as_str()) {
                    thumb = last.to_string();
                }
            }
            println!("CHRIS_LOG: used microformat fallback — title: {}, artist: {}, thumb_empty: {}", title, artist, thumb.is_empty());
        }

        // Songs are in secondaryContents
        let mut songs = Vec::new();
        let secondary = &data["contents"]["twoColumnBrowseResultsRenderer"]["secondaryContents"];
        let mut queue = vec![secondary.clone()];
        while let Some(current) = queue.pop() {
            if let Some(obj) = current.as_object() {
                if let Some(renderer) = obj.get("musicResponsiveListItemRenderer") {
                    let s_title = renderer["flexColumns"][0]["musicResponsiveListItemFlexColumnRenderer"]["text"]["runs"][0]["text"]
                        .as_str().unwrap_or_default().to_string();
                    let video_id = renderer["playlistItemData"]["videoId"].as_str().unwrap_or_default().to_string();
                    if !video_id.is_empty() && !s_title.is_empty() {
                        let is_explicit = renderer["badges"].as_array()
                            .map(|b| b.iter().any(|badge| badge["musicInlineBadgeRenderer"]["icon"]["iconType"].as_str() == Some("MUSIC_EXPLICIT_BADGE")))
                            .unwrap_or(false);

                        let mut d_text = None;
                        if let Some(fixed_cols) = renderer["fixedColumns"].as_array() {
                            for col in fixed_cols {
                                if let Some(runs) = col["musicResponsiveListItemFixedColumnRenderer"]["text"]["runs"].as_array() {
                                    for run in runs {
                                        if let Some(text) = run["text"].as_str() {
                                            if text.contains(':') && text.chars().all(|c| c.is_numeric() || c == ':') {
                                                d_text = Some(text.to_string());
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        songs.push(SearchResult {
                            id: video_id.clone(),
                            title: s_title,
                            artist_name: artist.clone(),
                            thumbnail_url: thumb.clone(),
                            source_type: "youtube".to_string(),
                            result_type: "song".to_string(),
                            name: None,
                            is_explicit: Some(is_explicit),
                            duration_text: d_text,
                            view_count_text: None, view_count: None,
                            raw_info: Some(renderer.to_string()),
                        });
                    }
                } else {
                    for (_, val) in obj {
                        if val.is_object() || val.is_array() { queue.push(val.clone()); }
                    }
                }
            } else if let Some(arr) = current.as_array() {
                for val in arr { queue.push(val.clone()); }
            }
        }

        println!("CHRIS_LOG: album songs found: {}", songs.len());

        if !songs.is_empty() || title != "Unknown Album" {
            return Ok(AlbumDetails { id: album_id, title, artist_name: artist, thumbnail_url: thumb, songs });
        }
    }

    Err("Failed to load album details".to_string())
}



#[tauri::command]
pub async fn get_streaming_url(
    app: tauri::AppHandle, 
    video_id: String,
    quality: Option<String>,
    proxy: Option<String>,
    doh: Option<String>,
    ipv4: Option<bool>
) -> Result<String, String> {
    let mut last_error = "Could not extract stream URL.".to_string();
    #[cfg(mobile)]
    let _ = app;

    #[cfg(desktop)]
    {
        let cookies = get_cookies_path(&app);
        let clients = ["ios,android", "android_music,android", "tv_embedded,web_creator", "mweb", "web"];
        let last_index = get_last_client_index();
        let mut client_indices: Vec<usize> = (0..clients.len()).collect();
        if last_index < clients.len() {
            client_indices.retain(|&i| i != last_index);
            client_indices.insert(0, last_index);
        }

        for &i in &client_indices {
            let client = clients[i];
            let client_arg = format!("youtube:player_client={}", client);
            let video_url = format!("https://www.youtube.com/watch?v={}", video_id);
            let format_selector = match quality.as_deref().unwrap_or("high") {
                "low" => "bestaudio[abr<=64]/worstaudio/worst",
                "normal" => "bestaudio[abr<=128]/bestaudio/best",
                _ => "bestaudio[ext=m4a]/bestaudio/best"
            };

            let mut args = vec![
                "--no-check-certificate".to_string(),
                "-g".to_string(), 
                "-f".to_string(), format_selector.to_string(), 
                "--extractor-args".to_string(), client_arg
            ];

            if let Some(true) = ipv4 {
                args.insert(0, "-4".to_string());
            }

            if let Some(ref p) = proxy {
                if !p.is_empty() {
                    args.push("--proxy".to_string());
                    args.push(p.clone());
                }
            }

            if let Some(ref path) = cookies {
                args.push("--cookies".to_string());
                args.push(path.clone());
            }
            
            args.push(video_url);

            let sidecar_result = app.shell().sidecar("yt-dlp");
            if let Ok(sidecar) = sidecar_result {
                let output = sidecar.args(&args).output().await;

                if let Ok(out) = output {
                    if out.status.success() {
                        set_last_client_index(i);
                        return Ok(String::from_utf8(out.stdout).map_err(|e| e.to_string())?.trim().to_string());
                    } else {
                        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                        error!("CHRIS_LOG: yt-dlp failed for client {}: {}", client, stderr);
                        last_error = format!("yt-dlp error ({}): {}", client, stderr);
                    }
                } else {
                    last_error = "Failed to execute yt-dlp sidecar output".to_string();
                }
            }
        }
    }

    // Fallback Invidious
    let instances = ["https://yewtu.be", "https://iv.melmac.space", "https://inv.tux.digital", "https://iv.ggtyler.dev"];
    
    if let Some(true) = ipv4 {
        builder = builder.ip_strategy(reqwest::dns::IpStrategy::Ipv4Only);
    }
    if let Some(ref p) = proxy {
        if !p.is_empty() {
            builder = builder.proxy(reqwest::Proxy::all(p).map_err(|e| e.to_string())?);
        }
    }
    let client = builder.build().map_err(|e| e.to_string())?;

    for instance in instances.iter() {
        let url = format!("{}/api/v1/videos/{}", instance, video_id);
        if let Ok(res) = client.get(&url).send().await {
            if let Ok(data) = res.json::<serde_json::Value>().await {
                if let Some(formats) = data["adaptiveFormats"].as_array() {
                    for format in formats {
                        if format["type"].as_str().unwrap_or("").contains("audio") {
                            if let Some(stream_url) = format["url"].as_str() { return Ok(stream_url.to_string()); }
                        }
                    }
                }
            }
        }
    }
    Err(last_error)
}

#[tauri::command]
pub async fn download_to_disk(
    app: tauri::AppHandle, 
    _video_id: String, 
    _title: String, 
    is_cache: Option<bool>,
    quality: Option<String>,
    proxy: Option<String>,
    doh: Option<String>,
    ipv4: Option<bool>
) -> Result<String, String> {
    let _ = doh; // Unused in yt-dlp
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let folder = if is_cache.unwrap_or(false) { "cache" } else { "downloads" };
    let target_dir = app_dir.join(folder);
    if !target_dir.exists() { fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?; }

    #[cfg(mobile)]
    { return Err("Downloads are currently desktop-only.".to_string()); }

    #[cfg(desktop)]
    {
        let mut last_error = "Download failed".to_string();
        let output_str = target_dir.join(format!("{}.%(ext)s", _video_id)).to_string_lossy().to_string();
        let cookies = get_cookies_path(&app);
        let clients = ["ios,android", "android_music,android", "tv_embedded,web_creator", "mweb", "web"];

        for client in clients {
            let format_selector = match quality.as_deref().unwrap_or("high") {
                "low" => "bestaudio[abr<=64]/worstaudio/worst",
                "normal" => "bestaudio[abr<=128]/bestaudio/best",
                _ => "bestaudio/best"
            };

            let client_arg = format!("youtube:player_client={}", client);
            let video_url = format!("https://www.youtube.com/watch?v={}", _video_id);
            let mut args = vec![
                "--no-check-certificate".to_string(),
                "--js-runtimes".to_string(), "node".to_string(), 
                "-f".to_string(), format_selector.to_string(), 
                "--force-overwrites".to_string(), 
                "--no-continue".to_string(), 
                "--extractor-args".to_string(), client_arg, 
                "-o".to_string(), output_str.clone()
            ];

            if let Some(true) = ipv4 {
                args.insert(0, "-4".to_string());
            }
            
            if let Some(ref p) = proxy {
                if !p.is_empty() {
                    args.push("--proxy".to_string());
                    args.push(p.clone());
                }
            }

            if let Some(ref path) = cookies {
                args.push("--cookies".to_string());
                args.push(path.clone());
            }

            args.push(video_url);

            if let Ok(sidecar) = app.shell().sidecar("yt-dlp") {
                let output = sidecar.args(&args).output().await;

                if let Ok(out) = output {
                    if out.status.success() {
                        if let Ok(entries) = fs::read_dir(&target_dir) {
                            for entry in entries.flatten() {
                                let path = entry.path();
                                if let Some(name) = path.file_name() {
                                    if name.to_string_lossy().starts_with(&_video_id) && !name.to_string_lossy().ends_with(".part") {
                                        return Ok(path.to_string_lossy().to_string());
                                    }
                                }
                            }
                        }
                    } else {
                        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                        error!("CHRIS_LOG: Download yt-dlp failed for client {}: {}", client, stderr);
                        last_error = format!("Download error ({}): {}", client, stderr);
                    }
                }
            }
        }
        Err(last_error)
    }
}
