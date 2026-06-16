use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    InvalidInput,
    NotFound,
    Ambiguous,
    InvalidState,
    System,
}

#[derive(Debug)]
pub struct EasyDoError {
    pub kind: ErrorKind,
    pub message: String,
}

impl EasyDoError {
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::InvalidInput, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::NotFound, message)
    }

    pub fn ambiguous(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Ambiguous, message)
    }

    pub fn invalid_state(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::InvalidState, message)
    }

    pub fn system(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::System, message)
    }

    fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl fmt::Display for EasyDoError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for EasyDoError {}

impl From<rusqlite::Error> for EasyDoError {
    fn from(error: rusqlite::Error) -> Self {
        let message = if error.to_string().contains("database is locked") {
            "数据库繁忙，请稍后重试".to_string()
        } else {
            format!("数据库操作失败: {error}")
        };
        Self::system(message)
    }
}

impl From<std::io::Error> for EasyDoError {
    fn from(error: std::io::Error) -> Self {
        Self::system(format!("文件操作失败: {error}"))
    }
}

impl From<serde_json::Error> for EasyDoError {
    fn from(error: serde_json::Error) -> Self {
        Self::system(format!("数据格式错误: {error}"))
    }
}

pub type Result<T> = std::result::Result<T, EasyDoError>;
