use tauri::{Runtime, WebviewWindow};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Shell::{ITaskbarList3, TaskbarList};
use windows::core::Interface;
use std::sync::Mutex;
use std::sync::OnceLock;

// IDs para los botones
const IDM_PREVIOUS: u16 = 101;
const IDM_PLAYPAUSE: u16 = 102;
const IDM_NEXT: u16 = 103;

// Wrapper para hacer la interfaz COM Send/Sync
struct SendInterface<T>(T);
unsafe impl<T> Send for SendInterface<T> {}
unsafe impl<T> Sync for SendInterface<T> {}

static TASKBAR_LIST: OnceLock<Mutex<Option<SendInterface<ITaskbarList3>>>> = OnceLock::new();

fn get_taskbar_list() -> &'static Mutex<Option<SendInterface<ITaskbarList3>>> {
    TASKBAR_LIST.get_or_init(|| Mutex::new(None))
}

pub fn init<R: Runtime>(_window: &WebviewWindow<R>) {
    // Temporarily disabled due to windows crate 0.58 compatibility issues with THBUTTON
}

pub fn update_play_state<R: Runtime>(_window: &WebviewWindow<R>, _is_playing: bool) {
    // Temporarily disabled due to windows crate 0.58 compatibility issues with THBUTTON
}

fn string_to_u16_array(s: &str) -> [u16; 260] {
    let mut array = [0u16; 260];
    let utf16: Vec<u16> = s.encode_utf16().collect();
    let len = std::cmp::min(utf16.len(), 259);
    array[..len].copy_from_slice(&utf16[..len]);
    array
}