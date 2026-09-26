//! Локальное хранилище заметок: SQLite «пространство → хранилище → ключ → JSON».
//!
//! Движок синхронизации (@mayak/sync) видит его через интерфейс KvBackend
//! (packages/local-store/src/kv.ts): чтение по ключу, чтение всего хранилища
//! и атомарная фиксация пакета операций в одной транзакции SQLite.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;

/// Хранилища из packages/local-store/src/types.ts (STORE_NAMES).
const STORES: [&str; 5] = ["notes", "outbox", "conflicts", "shadows", "meta"];

pub struct Store {
    conn: Mutex<Connection>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
pub enum Op {
    Put { store: String, key: String, value: String },
    Delete { store: String, key: String },
    Clear { store: String },
}

impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(err)?;
        Self::init(conn)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, String> {
        Self::init(Connection::open_in_memory().map_err(err)?)
    }

    fn init(conn: Connection) -> Result<Self, String> {
        // WAL — читатели не ждут писателя; FULL — зафиксированная заметка
        // переживает отключение питания.
        conn.execute_batch(
            "pragma journal_mode = wal;
             pragma synchronous = full;
             pragma foreign_keys = on;
             create table if not exists kv (
               ns    text not null,
               store text not null,
               key   text not null,
               value text not null,
               primary key (ns, store, key)
             ) without rowid;",
        )
        .map_err(err)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn get(&self, ns: &str, store: &str, key: &str) -> Result<Option<String>, String> {
        check(ns, store)?;
        let conn = self.conn.lock().map_err(err)?;
        conn.query_row(
            "select value from kv where ns = ?1 and store = ?2 and key = ?3",
            params![ns, store, key],
            |row| row.get(0),
        )
        .optional()
        .map_err(err)
    }

    pub fn all(&self, ns: &str, store: &str) -> Result<Vec<(String, String)>, String> {
        check(ns, store)?;
        let conn = self.conn.lock().map_err(err)?;
        // Порядок ключей как в IndexedDB: побайтовое сравнение UTF-8 (BINARY).
        let mut stmt = conn
            .prepare_cached("select key, value from kv where ns = ?1 and store = ?2 order by key")
            .map_err(err)?;
        let rows = stmt
            .query_map(params![ns, store], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(err)?;
        rows.collect::<Result<_, _>>().map_err(err)
    }

    /// Все операции — одна транзакция: либо фиксируются все, либо ни одной.
    pub fn commit(&self, ns: &str, ops: &[Op]) -> Result<(), String> {
        for op in ops {
            let (Op::Put { store, .. } | Op::Delete { store, .. } | Op::Clear { store }) = op;
            check(ns, store)?;
        }
        let mut conn = self.conn.lock().map_err(err)?;
        let tx = conn.transaction().map_err(err)?;
        for op in ops {
            match op {
                Op::Put { store, key, value } => tx.execute(
                    "insert into kv (ns, store, key, value) values (?1, ?2, ?3, ?4)
                     on conflict (ns, store, key) do update set value = excluded.value",
                    params![ns, store, key, value],
                ),
                Op::Delete { store, key } => tx.execute(
                    "delete from kv where ns = ?1 and store = ?2 and key = ?3",
                    params![ns, store, key],
                ),
                Op::Clear { store } => tx.execute("delete from kv where ns = ?1 and store = ?2", params![ns, store]),
            }
            .map_err(err)?;
        }
        tx.commit().map_err(err)
    }

    /// Удаляет все данные пространства (выход с удалением заметок с устройства).
    pub fn drop_namespace(&self, ns: &str) -> Result<(), String> {
        check(ns, STORES[0])?;
        let conn = self.conn.lock().map_err(err)?;
        conn.execute("delete from kv where ns = ?1", params![ns]).map_err(err)?;
        Ok(())
    }
}

fn check(ns: &str, store: &str) -> Result<(), String> {
    if ns.is_empty() || ns.len() > 200 {
        return Err("Недопустимое имя пространства".into());
    }
    if !STORES.contains(&store) {
        return Err(format!("Неизвестное хранилище: {store}"));
    }
    Ok(())
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn put(store: &str, key: &str, value: &str) -> Op {
        Op::Put { store: store.into(), key: key.into(), value: value.into() }
    }

    #[test]
    fn commit_is_atomic_and_namespaces_are_isolated() {
        let s = Store::open_in_memory().unwrap();
        s.commit("a", &[put("notes", "2", "\"b\""), put("notes", "1", "\"a\""), put("outbox", "1", "{}")])
            .unwrap();
        assert_eq!(s.all("a", "notes").unwrap(), vec![("1".into(), "\"a\"".into()), ("2".into(), "\"b\"".into())]);
        assert_eq!(s.get("b", "notes", "1").unwrap(), None);

        // Ошибка посреди пакета (неизвестное хранилище) — ничего не записано.
        let bad = s.commit("a", &[put("notes", "3", "3"), put("secrets", "x", "1")]);
        assert!(bad.is_err());
        assert_eq!(s.get("a", "notes", "3").unwrap(), None);
    }

    #[test]
    fn delete_clear_and_drop_namespace() {
        let s = Store::open_in_memory().unwrap();
        s.commit("a", &[put("notes", "1", "1"), put("notes", "2", "2"), put("meta", "k", "true")]).unwrap();
        s.commit("b", &[put("notes", "1", "1")]).unwrap();
        s.commit(
            "a",
            &[
                Op::Delete { store: "notes".into(), key: "1".into() },
                Op::Clear { store: "meta".into() },
                put("meta", "n", "1"),
            ],
        )
        .unwrap();
        assert_eq!(s.all("a", "notes").unwrap(), vec![("2".into(), "2".into())]);
        assert_eq!(s.all("a", "meta").unwrap(), vec![("n".into(), "1".into())]);
        s.drop_namespace("a").unwrap();
        assert!(s.all("a", "notes").unwrap().is_empty());
        assert_eq!(s.all("b", "notes").unwrap().len(), 1);
    }

    #[test]
    fn survives_reopen_from_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mayak.sqlite3");
        Store::open(&path).unwrap().commit("local", &[put("notes", "n", "{\"v\":1}")]).unwrap();
        assert_eq!(Store::open(&path).unwrap().get("local", "notes", "n").unwrap().as_deref(), Some("{\"v\":1}"));
    }

    #[test]
    fn ops_deserialize_from_js_shape() {
        let ops: Vec<Op> = serde_json::from_str(
            r#"[{"op":"clear","store":"notes"},{"op":"put","store":"notes","key":"a","value":"1"},{"op":"delete","store":"meta","key":"k"}]"#,
        )
        .unwrap();
        assert_eq!(ops.len(), 3);
        assert!(matches!(&ops[1], Op::Put { key, .. } if key == "a"));
    }
}
