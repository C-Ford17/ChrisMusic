use tauri::{Runtime, WebviewWindow, Emitter};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Shell::{
    ITaskbarList3, TaskbarList, THUMBBUTTON,
    THB_FLAGS, THB_ICON, THB_TOOLTIP, THBF_ENABLED,
    SetWindowSubclass, RemoveWindowSubclass, DefSubclassProc,
};
use windows::Win32::UI::WindowsAndMessaging::HICON;
use std::sync::Mutex;
use std::sync::OnceLock;

// IDs for the buttons
const IDM_PREVIOUS: u16 = 101;
const IDM_PLAYPAUSE: u16 = 102;
const IDM_NEXT: u16 = 103;

// Wrapper to make COM interfaces Send/Sync
struct SendInterface<T>(T);
unsafe impl<T> Send for SendInterface<T> {}
unsafe impl<T> Sync for SendInterface<T> {}

static TASKBAR_LIST: OnceLock<Mutex<Option<SendInterface<ITaskbarList3>>>> = OnceLock::new();

fn get_taskbar_list() -> &'static Mutex<Option<SendInterface<ITaskbarList3>>> {
    TASKBAR_LIST.get_or_init(|| {
        unsafe {
            // Initialize COM
            let _ = windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_APARTMENTTHREADED
            );
            
            let taskbar_list: Result<ITaskbarList3, _> = windows::Win32::System::Com::CoCreateInstance(
                &TaskbarList,
                None,
                windows::Win32::System::Com::CLSCTX_INPROC_SERVER
            );
            
            match taskbar_list {
                Ok(tbl) => {
                    let _ = tbl.HrInit();
                    Mutex::new(Some(SendInterface(tbl)))
                }
                Err(e) => {
                    println!("CHRIS_LOG: Failed to create ITaskbarList3 instance: {:?}", e);
                    Mutex::new(None)
                }
            }
        }
    })
}

unsafe fn load_system_icon(dll_name: &str, icon_index: u32) -> HICON {
    use windows::Win32::UI::Shell::ExtractIconW;
    use windows::Win32::Foundation::HINSTANCE;
    
    let wide_dll: Vec<u16> = dll_name.encode_utf16().chain(std::iter::once(0)).collect();
    ExtractIconW(
        HINSTANCE::default(), 
        windows::core::PCWSTR(wide_dll.as_ptr()), 
        icon_index
    )
}

fn string_to_u16_array(s: &str) -> [u16; 260] {
    let mut array = [0u16; 260];
    let utf16: Vec<u16> = s.encode_utf16().collect();
    let len = std::cmp::min(utf16.len(), 259);
    array[..len].copy_from_slice(&utf16[..len]);
    array
}

// Subclass window procedure to handle WM_COMMAND messages from thumbnail toolbar buttons
unsafe extern "system" fn taskbar_subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    id: usize,
    data: usize,
) -> LRESULT {
    if msg == windows::Win32::UI::WindowsAndMessaging::WM_COMMAND {
        let button_id = (wparam.0 & 0xFFFF) as u16;
        let notification_code = ((wparam.0 >> 16) & 0xFFFF) as u16;
        
        // THBN_CLICKED notification code is 0x1800
        if notification_code == 0x1800 {
            let window = &*(data as *const WebviewWindow);
            let cmd = match button_id {
                IDM_PREVIOUS => "prev",
                IDM_PLAYPAUSE => "play_pause",
                IDM_NEXT => "next",
                _ => "",
            };
            if !cmd.is_empty() {
                let _ = window.emit("taskbar-command", cmd);
            }
        }
    } else if msg == windows::Win32::UI::WindowsAndMessaging::WM_NCDESTROY {
        // Prevent memory leak by reclaiming and dropping the WebviewWindow Box
        let _ = Box::from_raw(data as *mut WebviewWindow);
        let _ = RemoveWindowSubclass(hwnd, Some(taskbar_subclass_proc), id);
    }
    
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

pub fn init<R: Runtime>(window: &WebviewWindow<R>) {
    unsafe {
        let hwnd = match window.hwnd() {
            Ok(h) => HWND(h.0 as *mut std::ffi::c_void),
            Err(_) => return,
        };

        let mut buttons = [THUMBBUTTON::default(); 3];
        
        buttons[0].iId = IDM_PREVIOUS as u32;
        buttons[0].dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
        buttons[0].hIcon = load_system_icon("imageres.dll", 123); // Previous track icon
        buttons[0].szTip = string_to_u16_array("Anterior");
        buttons[0].dwFlags = THBF_ENABLED;

        buttons[1].iId = IDM_PLAYPAUSE as u32;
        buttons[1].dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
        buttons[1].hIcon = load_system_icon("imageres.dll", 120); // Play icon
        buttons[1].szTip = string_to_u16_array("Reproducir");
        buttons[1].dwFlags = THBF_ENABLED;

        buttons[2].iId = IDM_NEXT as u32;
        buttons[2].dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
        buttons[2].hIcon = load_system_icon("imageres.dll", 124); // Next track icon
        buttons[2].szTip = string_to_u16_array("Siguiente");
        buttons[2].dwFlags = THBF_ENABLED;

        let list_lock = get_taskbar_list().lock().unwrap();
        if let Some(ref tbl) = *list_lock {
            let res = tbl.0.ThumbBarAddButtons(hwnd, &buttons);
            if res.is_ok() {
                // Subclass the window to intercept WM_COMMAND messages
                // Box the cloned WebviewWindow so we can pass it as ref_data
                let window_boxed = Box::new(window.clone());
                let window_ptr = Box::into_raw(window_boxed) as usize;
                
                let _ = SetWindowSubclass(hwnd, Some(taskbar_subclass_proc), 12345, window_ptr);
            } else {
                println!("CHRIS_LOG: ThumbBarAddButtons failed: {:?}", res);
            }
        }
    }
}

pub fn update_play_state<R: Runtime>(window: &WebviewWindow<R>, is_playing: bool) {
    unsafe {
        let hwnd = match window.hwnd() {
            Ok(h) => HWND(h.0 as *mut std::ffi::c_void),
            Err(_) => return,
        };

        let mut button = THUMBBUTTON::default();
        button.iId = IDM_PLAYPAUSE as u32;
        button.dwMask = THB_ICON | THB_TOOLTIP;
        
        if is_playing {
            button.hIcon = load_system_icon("imageres.dll", 121); // Pause icon
            button.szTip = string_to_u16_array("Pausar");
        } else {
            button.hIcon = load_system_icon("imageres.dll", 120); // Play icon
            button.szTip = string_to_u16_array("Reproducir");
        }

        let list_lock = get_taskbar_list().lock().unwrap();
        if let Some(ref tbl) = *list_lock {
            let _ = tbl.0.ThumbBarUpdateButtons(hwnd, &[button]);
        }
    }
}