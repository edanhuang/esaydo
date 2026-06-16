use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    ensure_sidecar_placeholder();
    tauri_build::build()
}

fn ensure_sidecar_placeholder() {
    let target = env::var("TARGET").expect("Cargo TARGET is unavailable");
    let path = PathBuf::from("binaries").join(format!("easydo-cli-{target}"));
    if path.exists() {
        return;
    }

    // Tauri requires the target-specific sidecar to exist while Cargo is
    // compiling the CLI that will replace it.
    fs::create_dir_all(path.parent().expect("sidecar parent")).expect("create sidecar directory");
    fs::write(&path, "#!/bin/sh\nexit 1\n").expect("write sidecar placeholder");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(&path)
            .expect("read sidecar placeholder metadata")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).expect("make sidecar placeholder executable");
    }
}
