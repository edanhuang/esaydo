mod commands;
mod db;
mod models;

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::Manager;

pub struct AppState {
    pub conn: Mutex<Connection>,
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let conn = db::init_database(app.handle()).map_err(|error| error.to_string())?;
            app.manage(AppState {
                conn: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::archive_todo,
            commands::complete_todo,
            commands::create_group,
            commands::create_todo,
            commands::list_board_views,
            commands::list_groups,
            commands::list_todos,
            commands::list_weekly_done,
            commands::reopen_todo,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run EasyDo");
}
