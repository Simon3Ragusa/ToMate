mod findings;
mod fs_cmds;
mod notch;
mod pptx;
mod watch;
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(workspace::Workspace::default())
        .invoke_handler(tauri::generate_handler![
            fs_cmds::open_workspace,
            fs_cmds::last_workspace,
            fs_cmds::list_dir,
            fs_cmds::list_all,
            fs_cmds::read_text,
            fs_cmds::read_bytes,
            fs_cmds::write_text,
            fs_cmds::create_file,
            fs_cmds::create_dir,
            fs_cmds::rename,
            fs_cmds::delete,
            fs_cmds::import_paths,
            fs_cmds::move_entry,
            fs_cmds::open_external,
            fs_cmds::reveal,
            watch::read_activity,
            pptx::pptx_to_pdf,
            notch::notch_click_through,
            findings::read_digest_dir,
            findings::sync_radar,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
