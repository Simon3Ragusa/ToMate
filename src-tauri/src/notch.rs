//! Focus notch helper: let a click on the notch fall through to the window
//! behind it (e.g. a browser tab the notch was covering).

use tauri::WebviewWindow;

/// Makes the calling window click-through, then replays a left click at the
/// cursor so it lands on whatever is underneath.
///
/// Sync commands run on the main thread, so the click-through style is
/// applied before the synthetic click is queued.
#[tauri::command]
pub fn notch_click_through(window: WebviewWindow) -> Result<(), String> {
    window.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    replay_click();
    Ok(())
}

#[cfg(windows)]
fn replay_click() {
    use std::mem::size_of;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEINPUT,
    };

    // No MOUSEEVENTF_MOVE / ABSOLUTE: the click happens where the cursor already is.
    let input = |flags| INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT { dx: 0, dy: 0, mouseData: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 },
        },
    };
    let inputs = [input(MOUSEEVENTF_LEFTDOWN), input(MOUSEEVENTF_LEFTUP)];
    unsafe {
        SendInput(inputs.len() as u32, inputs.as_ptr(), size_of::<INPUT>() as i32);
    }
}
