use std::path::Path;

/// Returns true if the carrier sysfs file contains exactly "1" (trimmed).
/// Returns false if file is missing, unreadable, or contains anything else.
/// Cheap: one syscall, no fork.
pub fn is_up(path: &Path) -> bool {
    match std::fs::read_to_string(path) {
        Ok(s) => s.trim() == "1",
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn returns_true_for_one() {
        let p = write_temp("1\n");
        assert!(is_up(&p));
    }

    #[test]
    fn returns_true_for_one_no_newline() {
        let p = write_temp("1");
        assert!(is_up(&p));
    }

    #[test]
    fn returns_false_for_zero() {
        let p = write_temp("0\n");
        assert!(!is_up(&p));
    }

    #[test]
    fn returns_false_for_missing_file() {
        let p = PathBuf::from("/nonexistent/carrier_does_not_exist");
        assert!(!is_up(&p));
    }

    #[test]
    fn returns_false_for_garbage() {
        let p = write_temp("hello world\n");
        assert!(!is_up(&p));
    }

    fn write_temp(body: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let p = std::env::temp_dir().join(format!("qping-carrier-{}-{}", std::process::id(), nanos));
        std::fs::write(&p, body).unwrap();
        p
    }
}
