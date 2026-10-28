mod bot_runner;
mod commands;
pub mod core;

use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use std::{env, path::PathBuf};

use rusqlite::Connection;
use tauri::Manager;

pub struct AppState {
    pub conn: Mutex<Connection>,
    pub runs: bot_runner::RunRegistry,
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            let database_path = env::var_os("EASYDO_DB_PATH")
                .map(PathBuf::from)
                .unwrap_or_else(|| app_data_dir.join(core::db::DATABASE_FILE));
            let conn =
                core::db::open_database(&database_path).map_err(|error| error.to_string())?;
            let mut conn = conn;
            core::todo_service::purge_expired_inbox_todos_now(&mut conn)
                .map_err(|error| error.to_string())?;
            // 上次退出时还在跑的 Bot 任务，进程已经没了
            core::bot_service::mark_interrupted_runs(&mut conn).map_err(|error| error.to_string())?;
            app.manage(AppState {
                conn: Mutex::new(conn),
                runs: bot_runner::RunRegistry::default(),
            });
            thread::spawn(move || loop {
                thread::sleep(Duration::from_secs(15 * 60));
                if let Ok(mut conn) = core::db::open_database(&database_path) {
                    let _ = core::todo_service::purge_expired_inbox_todos_now(&mut conn);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::append_canvas_log,
            commands::choose_bot_directory,
            commands::count_bot_messages,
            commands::create_bot,
            commands::delete_bot,
            commands::dispatch_todo_to_bot,
            commands::get_bot_dispatch_preview,
            commands::list_active_bot_runs,
            commands::list_bot_conversations,
            commands::list_bot_messages,
            commands::list_bot_unread,
            commands::list_bots,
            commands::mark_bot_messages_read,
            commands::stop_bot_run,
            commands::update_bot,
            commands::archive_todo,
            commands::choose_skill_install_directory,
            commands::complete_todo,
            commands::count_inbox_todos,
            commands::create_group,
            commands::create_inbox_todo,
            commands::create_todo,
            commands::delete_todo,
            commands::get_appearance_settings,
            commands::get_cli_install_status,
            commands::get_layout_settings,
            commands::get_selected_board_view_id,
            commands::get_skill_install_statuses,
            commands::get_shortcut_settings,
            commands::install_cli_tool,
            commands::install_skill_to_target,
            commands::list_available_skills,
            commands::list_board_views,
            commands::list_canvas_positions,
            commands::get_board_layout_mode,
            commands::list_daily_todos,
            commands::list_groups,
            commands::list_todos,
            commands::list_weekly_done,
            commands::move_todo_from_inbox,
            commands::reopen_todo,
            commands::reorder_todos_in_group,
            commands::save_appearance_settings,
            commands::save_layout_settings,
            commands::save_selected_board_view_id,
            commands::save_canvas_positions,
            commands::save_board_layout_mode,
            commands::save_shortcut_settings,
            commands::set_board_view_group_membership,
            commands::set_todo_priority,
            commands::set_todo_suspended,
            commands::update_todo_detail,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build EasyDo")
        .run(|app, event| {
            // 退出时结束所有 Bot 进程；数据库里的运行记录下次启动时标记为已中断
            if let tauri::RunEvent::Exit = event {
                app.state::<AppState>().runs.stop_all();
            }
        });
}
