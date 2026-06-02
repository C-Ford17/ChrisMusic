use tauri::{Runtime, WebviewWindow, Emitter};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Shell::{
    ITaskbarList3, TaskbarList, THUMBBUTTON,
    THB_FLAGS, THB_ICON, THB_TOOLTIP, THBF_ENABLED,
    SetWindowSubclass, RemoveWindowSubclass, DefSubclassProc,
};
use windows::Win32::UI::WindowsAndMessaging::{CreateIconIndirect, ICONINFO, HICON};
use windows::Win32::Graphics::Gdi::{CreateBitmap, DeleteObject};
use std::sync::Mutex;
use std::sync::OnceLock;

// IDs for the buttons
const IDM_PREVIOUS: u16 = 101;
const IDM_PLAYPAUSE: u16 = 102;
const IDM_NEXT: u16 = 103;

// Wrapper to make COM/HICON interfaces Send/Sync
struct SendInterface<T>(T);
unsafe impl<T> Send for SendInterface<T> {}
unsafe impl<T> Sync for SendInterface<T> {}

static TASKBAR_LIST: OnceLock<Mutex<Option<SendInterface<ITaskbarList3>>>> = OnceLock::new();

static HICON_PREV: OnceLock<SendInterface<HICON>> = OnceLock::new();
static HICON_PLAY: OnceLock<SendInterface<HICON>> = OnceLock::new();
static HICON_PAUSE: OnceLock<SendInterface<HICON>> = OnceLock::new();
static HICON_NEXT: OnceLock<SendInterface<HICON>> = OnceLock::new();

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

// Draw a filled rectangle onto the pixel buffer
fn draw_rect(pixels: &mut [u32], x: usize, y: usize, w: usize, h: usize) {
    for py in y..(y + h) {
        for px in x..(x + w) {
            if px < 16 && py < 16 {
                pixels[py * 16 + px] = 0xFFFFFFFF; // White ARGB (Alpha = 255, R=255, G=255, B=255)
            }
        }
    }
}

// Draw a play triangle pointing to the right
fn draw_play_triangle(pixels: &mut [u32]) {
    for x in 4..=12 {
        let half_h = match x {
            4 | 5 => 5,
            6 | 7 => 4,
            8 | 9 => 3,
            10 | 11 => 2,
            _ => 1, // x = 12
        };
        for y in (8 - half_h)..=(7 + half_h) {
            pixels[y * 16 + x] = 0xFFFFFFFF;
        }
    }
}

// Draw a left-pointing triangle
fn draw_prev_triangle(pixels: &mut [u32]) {
    for x in 5..=12 {
        let half_h = match x {
            5 => 1,
            6 | 7 => 2,
            8 | 9 => 3,
            10 | 11 => 4,
            _ => 5, // x = 12
        };
        for y in (8 - half_h)..=(7 + half_h) {
            pixels[y * 16 + x] = 0xFFFFFFFF;
        }
    }
}

// Draw a right-pointing triangle (base for Next button)
fn draw_next_triangle(pixels: &mut [u32]) {
    for x in 3..=10 {
        let half_h = match x {
            3 => 5,
            4 | 5 => 4,
            6 | 7 => 3,
            8 | 9 => 2,
            _ => 1, // x = 10
        };
        for y in (8 - half_h)..=(7 + half_h) {
            pixels[y * 16 + x] = 0xFFFFFFFF;
        }
    }
}

// Helper to create an HICON from raw ARGB u32 pixels
unsafe fn create_hicon_from_pixels(pixels: &[u32]) -> HICON {
    let hbm_color = CreateBitmap(16, 16, 1, 32, Some(pixels.as_ptr() as *const _));
    
    // Monochrome AND mask bitmap (exactly 32 bytes for 16x16 at 1bpp, aligned to WORD)
    let mask_pixels = vec![0u8; 32];
    let hbm_mask = CreateBitmap(16, 16, 1, 1, Some(mask_pixels.as_ptr() as *const _));
    
    let mut icon_info = ICONINFO {
        fIcon: windows::Win32::Foundation::BOOL::from(true),
        xHotspot: 0,
        yHotspot: 0,
        hbmMask: hbm_mask,
        hbmColor: hbm_color,
    };
    
    let hicon = CreateIconIndirect(&mut icon_info).unwrap();
    
    // Clean up temporary bitmaps
    let _ = DeleteObject(hbm_color);
    let _ = DeleteObject(hbm_mask);
    
    hicon
}

fn get_hicon_prev() -> HICON {
    HICON_PREV.get_or_init(|| {
        let mut pixels = vec![0u32; 16 * 16];
        draw_prev_triangle(&mut pixels);
        draw_rect(&mut pixels, 3, 3, 2, 10); // Left vertical bar
        unsafe { SendInterface(create_hicon_from_pixels(&pixels)) }
    }).0
}

fn get_hicon_play() -> HICON {
    HICON_PLAY.get_or_init(|| {
        let mut pixels = vec![0u32; 16 * 16];
        draw_play_triangle(&mut pixels);
        unsafe { SendInterface(create_hicon_from_pixels(&pixels)) }
    }).0
}

fn get_hicon_pause() -> HICON {
    HICON_PAUSE.get_or_init(|| {
        let mut pixels = vec![0u32; 16 * 16];
        draw_rect(&mut pixels, 4, 3, 3, 10); // Left bar
        draw_rect(&mut pixels, 10, 3, 3, 10); // Right bar
        unsafe { SendInterface(create_hicon_from_pixels(&pixels)) }
    }).0
}

fn get_hicon_next() -> HICON {
    HICON_NEXT.get_or_init(|| {
        let mut pixels = vec![0u32; 16 * 16];
        draw_next_triangle(&mut pixels);
        draw_rect(&mut pixels, 11, 3, 2, 10); // Right vertical bar
        unsafe { SendInterface(create_hicon_from_pixels(&pixels)) }
    }).0
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
        buttons[0].hIcon = get_hicon_prev();
        buttons[0].szTip = string_to_u16_array("Anterior");
        buttons[0].dwFlags = THBF_ENABLED;

        buttons[1].iId = IDM_PLAYPAUSE as u32;
        buttons[1].dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
        buttons[1].hIcon = get_hicon_play();
        buttons[1].szTip = string_to_u16_array("Reproducir");
        buttons[1].dwFlags = THBF_ENABLED;

        buttons[2].iId = IDM_NEXT as u32;
        buttons[2].dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
        buttons[2].hIcon = get_hicon_next();
        buttons[2].szTip = string_to_u16_array("Siguiente");
        buttons[2].dwFlags = THBF_ENABLED;

        let list_lock = get_taskbar_list().lock().unwrap();
        if let Some(ref tbl) = *list_lock {
            let res = tbl.0.ThumbBarAddButtons(hwnd, &buttons);
            if res.is_ok() {
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
            button.hIcon = get_hicon_pause();
            button.szTip = string_to_u16_array("Pausar");
        } else {
            button.hIcon = get_hicon_play();
            button.szTip = string_to_u16_array("Reproducir");
        }

        let list_lock = get_taskbar_list().lock().unwrap();
        if let Some(ref tbl) = *list_lock {
            let _ = tbl.0.ThumbBarUpdateButtons(hwnd, &[button]);
        }
    }
}