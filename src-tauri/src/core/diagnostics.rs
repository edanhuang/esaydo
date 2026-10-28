use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::Local;

// 超过 1MB 就把旧日志挪到 .1，只留一份备份
const MAX_LOG_BYTES: u64 = 1024 * 1024;

/// 画布交互的排查日志：~/Library/Logs/EasyDo/canvas.log
pub fn canvas_log_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join("Library/Logs/EasyDo/canvas.log"))
}

/// 每行前面加上本地时间（精确到毫秒）后追加到日志文件。
pub fn append_log_lines(path: &Path, lines: &[String]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    if fs::metadata(path).map(|meta| meta.len() > MAX_LOG_BYTES).unwrap_or(false) {
        fs::rename(path, path.with_extension("log.1"))?;
    }
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    for line in lines {
        // 一条记录只占一行，内容里的换行压成空格
        writeln!(file, "{timestamp} {}", line.replace('\n', " "))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_timestamped_single_line_records() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("logs/canvas.log");

        append_log_lines(&path, &["drag start todo=a".to_string()]).expect("first write");
        append_log_lines(&path, &["drop\nsaved".to_string()]).expect("second write");

        let content = fs::read_to_string(&path).expect("read log");
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].ends_with(" drag start todo=a"));
        assert!(lines[1].ends_with(" drop saved"));
    }

    #[test]
    fn rotates_when_the_log_grows_too_large() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("canvas.log");
        fs::write(&path, vec![b'x'; (MAX_LOG_BYTES + 1) as usize]).expect("seed log");

        append_log_lines(&path, &["fresh".to_string()]).expect("write");

        assert!(dir.path().join("canvas.log.1").exists());
        assert!(fs::read_to_string(&path).expect("read log").ends_with(" fresh\n"));
    }
}
