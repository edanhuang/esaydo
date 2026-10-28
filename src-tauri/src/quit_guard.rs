//! 按 ⌘Q 退出前先弹窗确认（有 Bot 在运行时提示它们会在后台继续跑）；关窗口只在有 Bot 在运行时确认。
//! macOS 自带的「退出」菜单项会直接结束程序、拦不住，所以换成自己的菜单项（快捷键仍是 ⌘Q）；
//! 关窗口可以直接拦。程序坞右键「退出」走的是系统那条路，拦不了。

use tauri::menu::{Menu, MenuItem};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::core::bot_service;
use crate::AppState;

pub const CONFIRM_QUIT_EVENT: &str = "confirm-quit";
const QUIT_MENU_ID: &str = "easydo-quit";

/// 默认菜单，只把应用菜单里最后一项「退出」换成自己的
pub fn install_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = Menu::default(app)?;
    if let Some(app_menu) = menu.items()?.first().and_then(|item| item.as_submenu().cloned()) {
        let items = app_menu.items()?;
        if let Some(quit) = items.last() {
            app_menu.remove(quit)?;
        }
        app_menu.append(&MenuItem::with_id(app, QUIT_MENU_ID, "退出 EasyDo", true, Some("CmdOrCtrl+Q"))?)?;
    }
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() == QUIT_MENU_ID {
            request_quit(app);
        }
    });
    Ok(())
}

pub fn running_count<R: Runtime>(app: &AppHandle<R>) -> usize {
    let state = app.state::<AppState>();
    let count = state
        .conn
        .lock()
        .ok()
        .and_then(|conn| bot_service::list_active_runs(&conn).ok())
        .map_or(0, |runs| runs.len());
    count
}

/// 交给前端弹窗确认，参数是正在运行的 Bot 数
pub fn request_quit<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit(CONFIRM_QUIT_EVENT, running_count(app));
}
