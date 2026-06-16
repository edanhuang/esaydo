use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub detail: String,
    pub status: String,
    pub extra_text: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub archived_at: Option<String>,
    pub expires_at: Option<String>,
    pub deleted_at: Option<String>,
    pub delete_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
    pub system_key: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TodoWithRelations {
    pub id: String,
    pub detail: String,
    pub status: String,
    pub extra_text: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub archived_at: Option<String>,
    pub expires_at: Option<String>,
    pub deleted_at: Option<String>,
    pub delete_reason: Option<String>,
    pub groups: Vec<Group>,
    pub group_sort_orders: Vec<TodoGroupSortOrder>,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TodoGroupSortOrder {
    pub group_id: String,
    pub sort_order: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BoardViewWithGroups {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
    pub system_key: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub groups: Vec<Group>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutBinding {
    pub key: String,
    pub meta_key: bool,
    pub shift_key: bool,
    pub alt_key: bool,
    pub ctrl_key: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutSettings {
    pub version: u16,
    pub open_settings: ShortcutBinding,
    pub select_previous_todo: ShortcutBinding,
    pub select_next_todo: ShortcutBinding,
    pub edit_selected_todo: ShortcutBinding,
    pub toggle_selected_todo_done: ShortcutBinding,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub version: u16,
    pub mode: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LayoutSettings {
    pub version: u16,
    pub sidebar_collapsed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CliInstallStatus {
    pub state: String,
    pub source_path: Option<String>,
    pub link_path: String,
    pub message: String,
}
