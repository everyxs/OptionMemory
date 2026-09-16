//! Mem-mode mnestic adapter: interactive REPL + CozoScript HTTP endpoint.
//! Adaptation layer only — the mnestic crate is used as-is.

use cozo::{DataValue, DbInstance, ScriptMutability};
use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::thread;
use std::time::Instant;

const DEFAULT_PORT: u16 = 9070;
const MNESTIC_VERSION: &str = "0.17.0";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let port = parse_port();
    let db = DbInstance::new("mem", "", "")?;
    let db = Arc::new(db);

    println!("==============================================================");
    println!(" mnestic memory engine — Mem-mode adapter (optionmemory)");
    println!(" mnestic crate : {MNESTIC_VERSION} (crates.io, in-place; lib name `cozo`)");
    println!(" storage       : mem (in-memory, non-persistent)");
    println!(" HTTP endpoint : http://127.0.0.1:{port}/text-query  (POST CozoScript)");
    println!(" info          : http://127.0.0.1:{port}/            (GET/HEAD)");
    println!(" REPL          : type CozoScript, blank line to run, :quit to exit");
    println!("==============================================================");

    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| {
        format!("cannot bind 127.0.0.1:{port}: {e} (port already in use? try --port <n>)")
    })?;
    println!("[ready] listening on 127.0.0.1:{port} — engine=mem");

    {
        let db = Arc::clone(&db);
        thread::spawn(move || {
            for conn in listener.incoming() {
                match conn {
                    Ok(stream) => {
                        let db = Arc::clone(&db);
                        thread::spawn(move || {
                            if let Err(e) = handle_conn(stream, &db) {
                                eprintln!("[http] connection error: {e}");
                            }
                        });
                    }
                    Err(e) => eprintln!("[http] accept error: {e}"),
                }
            }
        });
    }

    repl(&db);
    Ok(())
}

fn parse_port() -> u16 {
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        if a == "--port" {
            if let Some(v) = args.next() {
                if let Ok(p) = v.parse() {
                    return p;
                }
            }
        } else if let Some(v) = a.strip_prefix("--port=") {
            if let Ok(p) = v.parse() {
                return p;
            }
        }
    }
    std::env::var("MNESTIC_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_PORT)
}

fn run_query(db: &DbInstance, script: &str, params: BTreeMap<String, DataValue>) -> String {
    let t0 = Instant::now();
    let out = db.run_script(script, params, ScriptMutability::Mutable);
    let elapsed = t0.elapsed();
    match out {
        Ok(nr) => {
            // Natural-JSON wire format (same as upstream cozo-bin):
            // plain values in rows instead of the tagged enum repr.
            let rows: Vec<Vec<serde_json::Value>> = nr
                .rows
                .iter()
                .map(|r| {
                    r.iter()
                        .map(|v| serde_json::Value::from(v.clone()))
                        .collect()
                })
                .collect();
            let body = serde_json::json!({"headers": nr.headers, "rows": rows, "next": null})
                .to_string();
            println!("[query] ok — {} row(s) in {:?}", rows.len(), elapsed);
            body
        }
        Err(e) => {
            println!("[query] error in {:?}: {e}", elapsed);
            serde_json::json!({"ok": false, "message": e.to_string()}).to_string()
        }
    }
}

// ---------- HTTP (std-only, one thread per connection, Connection: close) ----------

fn handle_conn(stream: TcpStream, db: &DbInstance) -> Result<(), Box<dyn std::error::Error>> {
    let peer = stream.peer_addr().ok();
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line)? == 0 {
        return Ok(());
    }
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let path = parts.next().unwrap_or("").to_string();

    let mut content_length = 0usize;
    let mut expect_continue = false;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 || line == "\r\n" || line == "\n" {
            break;
        }
        let lower = line.to_ascii_lowercase();
        if let Some(v) = lower.strip_prefix("content-length:") {
            content_length = v.trim().parse().unwrap_or(0);
        } else if lower.starts_with("expect:") && lower.contains("100-continue") {
            expect_continue = true;
        }
    }
    if expect_continue {
        stream.try_clone()?.write_all(b"HTTP/1.1 100 Continue\r\n\r\n")?;
    }
    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body)?;

    let (status, payload) = match (method.as_str(), path.as_str()) {
        ("GET", "/") | ("HEAD", "/") => (
            "200 OK",
            serde_json::json!({
                "name": "mnestic",
                "version": MNESTIC_VERSION,
                "engine": "mem",
                "persistent": false,
                "endpoints": {"POST /text-query": {"script": "...", "params": {}}}
            })
            .to_string(),
        ),
        ("POST", "/text-query") => {
            let t0 = Instant::now();
            match serde_json::from_slice::<serde_json::Value>(&body) {
                Ok(v) => match v.get("script").and_then(|s| s.as_str()) {
                    Some(script) => {
                        let mut params = BTreeMap::new();
                        if let Some(obj) = v.get("params").and_then(|p| p.as_object()) {
                            for (k, pv) in obj {
                                params.insert(k.clone(), DataValue::from(pv.clone()));
                            }
                        }
                        let body_str = run_query(db, script, params);
                        println!(
                            "[http] {:?} POST /text-query -> 200 OK in {:?}",
                            peer,
                            t0.elapsed()
                        );
                        ("200 OK", body_str)
                    }
                    None => (
                        "400 Bad Request",
                        r#"{"ok":false,"message":"missing \"script\" field"}"#.to_string(),
                    ),
                },
                Err(e) => (
                    "400 Bad Request",
                    serde_json::json!({"ok": false, "message": format!("invalid JSON: {e}")})
                        .to_string(),
                ),
            }
        }
        _ => (
            "404 Not Found",
            r#"{"ok":false,"message":"not found"}"#.to_string(),
        ),
    };

    let mut resp = format!(
        "HTTP/1.1 {status}\r\ncontent-type: application/json; charset=utf-8\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
        payload.len()
    );
    if method != "HEAD" {
        resp.push_str(&payload);
    }
    stream.try_clone()?.write_all(resp.as_bytes())?;
    Ok(())
}

// ---------- interactive REPL ----------

fn repl(db: &Arc<DbInstance>) {
    let stdin = std::io::stdin();
    let mut buf = String::new();
    loop {
        eprint!("{}", if buf.is_empty() { "mnestic> " } else { "   ...> " });
        let mut line = String::new();
        match stdin.lock().read_line(&mut line) {
            Ok(0) => {
                // stdin closed (detached start): keep the HTTP server alive.
                eprintln!("\n[repl] stdin closed — HTTP endpoint stays up; Ctrl+C to stop");
                loop {
                    thread::park();
                }
            }
            Ok(_) => {}
            Err(e) => {
                eprintln!("[repl] read error: {e}");
                return;
            }
        }
        let trimmed = line.trim();
        if buf.is_empty() {
            match trimmed {
                "" => continue,
                ":quit" | ":exit" | ":q" => {
                    println!("bye");
                    std::process::exit(0);
                }
                ":help" => {
                    println!("CozoScript statements; end with a blank line to execute.");
                    println!("special: :quit  :help   (system ops like ::relations work too)");
                    continue;
                }
                _ => {}
            }
        }
        if trimmed.is_empty() {
            let script = std::mem::take(&mut buf);
            println!("{}", run_query(db, &script, BTreeMap::new()));
        } else {
            buf.push_str(&line);
        }
    }
}
