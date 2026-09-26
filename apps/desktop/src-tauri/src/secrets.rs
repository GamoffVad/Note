//! Ключ шифрования сессии входа в системном хранилище секретов.
//!
//! Сессия Supabase (токены и профиль) может быть больше 2560 байт — предела
//! Диспетчера учётных данных Windows (CRED_MAX_CREDENTIAL_BLOB_SIZE = 5*512).
//! Поэтому в Связке ключей / Диспетчере учётных данных / Secret Service
//! хранится только случайный 256-битный ключ, а сама сессия — зашифрованной
//! AES-GCM в хранилище окна (apps/web/src/state/native.ts).

/// Имя службы в системном хранилище секретов (совпадает с identifier приложения).
const SERVICE: &str = "io.github.gamoffvad.mayak";
const ACCOUNT: &str = "session-key";

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn session_key() -> Result<String, String> {
    use keyring::{Entry, Error};
    let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("keyring-unavailable: {e}"))?;
    match entry.get_password() {
        Ok(key) if key.len() == 64 && key.bytes().all(|b| b.is_ascii_hexdigit()) => Ok(key),
        Ok(_) | Err(Error::NoEntry) => {
            let key = random_hex()?;
            entry.set_password(&key).map_err(|e| format!("keyring-unavailable: {e}"))?;
            Ok(key)
        }
        Err(e) => Err(format!("keyring-unavailable: {e}")),
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn session_key() -> Result<String, String> {
    Err("keyring-unavailable: мобильное хранилище секретов ещё не подключено".into())
}

#[cfg_attr(any(target_os = "android", target_os = "ios"), allow(dead_code))]
fn random_hex() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

#[cfg(test)]
mod tests {
    #[test]
    fn random_key_is_64_hex_chars_and_unique() {
        let a = super::random_hex().unwrap();
        let b = super::random_hex().unwrap();
        assert_eq!(a.len(), 64);
        assert!(a.bytes().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }
}
