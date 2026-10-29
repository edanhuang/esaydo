mod bot_runner;
mod commands;
mod quit_guard;
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
    /// Bot 运行的输出文件放这里，和数据库在同一个目录下
    pub runs_dir: PathBuf,
    /// 小石头的工作目录：它只调用 easydo 命令行，这里只用来存它的会话
    pub steward_dir: PathBuf,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
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
            let runs_dir = database_path
                .parent()
                .map(|dir| dir.join("bot-runs"))
                .unwrap_or_else(|| app_data_dir.join("bot-runs"));
            let steward_dir = runs_dir.with_file_name("steward");
            app.manage(AppState {
                conn: Mutex::new(conn),
                runs: bot_runner::RunRegistry::default(),
                runs_dir,
                steward_dir,
            });
            // 上次退出时还标着运行中的 Bot：接回还在后台跑的，同步已经跑完的
            bot_runner::recover(app.handle().clone());
            quit_guard::install_menu(app.handle())?;
            thread::spawn(move || loop {
                thread::sleep(Duration::from_secs(15 * 60));
                if let Ok(mut conn) = core::db::open_database(&database_path) {
                    let _ = core::todo_service::purge_expired_inbox_todos_now(&mut conn);
                }
            });
            Ok(())
        })
        // 关窗口等同于退出：有 Bot 在跑时先拦下，交给前端确认
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if quit_guard::running_count(window.app_handle()) > 0 {
                    api.prevent_close();
                    quit_guard::request_quit(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::append_canvas_log,
            commands::quit_app,
            commands::open_bot_session_in_terminal,
            commands::get_terminal_settings,
            commands::save_terminal_settings,
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
            commands::get_steward_state,
            commands::list_steward_messages,
            commands::mark_steward_read,
            commands::new_steward_conversation,
            commands::send_to_steward,
            commands::stop_steward,
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
        // 退出时不结束 Bot：它们在后台继续跑完，下次启动时同步结果
        .run(tauri::generate_context!())
        .expect("failed to run EasyDo");
}
