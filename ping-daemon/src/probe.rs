use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownReason {
    CarrierDown,
    Timeout,
    Refused,
    Reset,
    Dns,
    Malformed,
}

impl DownReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            DownReason::CarrierDown => "carrier_down",
            DownReason::Timeout => "timeout",
            DownReason::Refused => "refused",
            DownReason::Reset => "reset",
            DownReason::Dns => "dns",
            DownReason::Malformed => "malformed",
        }
    }
}

#[derive(Debug, Clone)]
pub enum ProbeOutcome {
    Connected { rtt_ms: f32, tcp_reused: bool },
    Limited { rtt_ms: f32, http_code: u16, tcp_reused: bool },
    Disconnected { reason: DownReason },
}

pub struct KeepAliveClient {
    connections: HashMap<String, TcpStream>,
    timeout: Duration,
}

impl KeepAliveClient {
    pub fn new(timeout: Duration) -> Self {
        Self { connections: HashMap::new(), timeout }
    }

    /// Probe a target URL. Returns the outcome enum.
    pub fn probe(&mut self, url: &str) -> ProbeOutcome {
        let parsed = match crate::url::parse(url) {
            Some(p) => p,
            None => return ProbeOutcome::Disconnected { reason: DownReason::Malformed },
        };
        let host_port = format!("{}:{}", parsed.host, parsed.port);
        let host_for_header = parsed.host.clone();

        let start = Instant::now();
        let (mut stream, tcp_reused) = match self.connections.remove(&host_port) {
            Some(s) => (s, true),
            None => match self.dial(&host_port) {
                Ok(s) => (s, false),
                Err(reason) => return ProbeOutcome::Disconnected { reason },
            },
        };

        if let Err(reason) = self.send_get(&mut stream, &host_for_header, &parsed.path) {
            // Reset path: drop connection, attempt one fresh dial in this same probe cycle.
            // This avoids a "stale keepalive = false alarm" event on every Nth probe when
            // the server / carrier closes idle connections silently.
            if tcp_reused {
                let mut fresh = match self.dial(&host_port) {
                    Ok(s) => s,
                    Err(r) => return ProbeOutcome::Disconnected { reason: r },
                };
                if let Err(r) = self.send_get(&mut fresh, &host_for_header, &parsed.path) {
                    return ProbeOutcome::Disconnected { reason: r };
                }
                return self.read_response(fresh, &host_port, start, false);
            }
            return ProbeOutcome::Disconnected { reason };
        }

        self.read_response(stream, &host_port, start, tcp_reused)
    }

    fn dial(&self, host_port: &str) -> Result<TcpStream, DownReason> {
        let addrs: Vec<_> = match host_port.to_socket_addrs() {
            Ok(it) => it.collect(),
            Err(_) => return Err(DownReason::Dns),
        };
        let addr = addrs.first().ok_or(DownReason::Dns)?;
        let stream = TcpStream::connect_timeout(addr, self.timeout).map_err(map_io_err)?;
        stream.set_read_timeout(Some(self.timeout)).ok();
        stream.set_write_timeout(Some(self.timeout)).ok();
        stream.set_nodelay(true).ok();
        Ok(stream)
    }

    fn send_get(&self, stream: &mut TcpStream, host: &str, path: &str) -> Result<(), DownReason> {
        let req = format!(
            "GET {} HTTP/1.1\r\nHost: {}\r\nConnection: keep-alive\r\nUser-Agent: qmanager-ping/0.1\r\nAccept: */*\r\n\r\n",
            path, host
        );
        stream.write_all(req.as_bytes()).map_err(map_io_err)?;
        Ok(())
    }

    fn read_response(
        &mut self,
        stream: TcpStream,
        host_port: &str,
        start: Instant,
        tcp_reused: bool,
    ) -> ProbeOutcome {
        let mut reader = BufReader::new(stream);

        let mut status_line = String::new();
        if reader.read_line(&mut status_line).is_err() || status_line.is_empty() {
            return ProbeOutcome::Disconnected { reason: DownReason::Reset };
        }

        let code = match parse_status_code(&status_line) {
            Some(c) => c,
            None => return ProbeOutcome::Disconnected { reason: DownReason::Malformed },
        };

        let mut content_length: u64 = 0;
        let mut connection_close = false;
        loop {
            let mut line = String::new();
            if reader.read_line(&mut line).is_err() {
                return ProbeOutcome::Disconnected { reason: DownReason::Reset };
            }
            if line == "\r\n" || line == "\n" || line.is_empty() {
                break;
            }
            let lower = line.to_ascii_lowercase();
            if let Some(rest) = lower.strip_prefix("content-length:") {
                if let Ok(n) = rest.trim().parse::<u64>() { content_length = n; }
            } else if let Some(rest) = lower.strip_prefix("connection:") {
                if rest.trim() == "close" { connection_close = true; }
            }
        }

        if content_length > 0 {
            let mut to_read = content_length;
            let mut buf = [0u8; 4096];
            while to_read > 0 {
                let want = std::cmp::min(buf.len() as u64, to_read) as usize;
                match reader.read(&mut buf[..want]) {
                    Ok(0) => return ProbeOutcome::Disconnected { reason: DownReason::Reset },
                    Ok(n) => to_read -= n as u64,
                    Err(_) => return ProbeOutcome::Disconnected { reason: DownReason::Reset },
                }
            }
        }

        let rtt_ms = (start.elapsed().as_secs_f64() * 1000.0) as f32;
        let stream = reader.into_inner();

        if !connection_close {
            self.connections.insert(host_port.to_string(), stream);
        }
        // If connection_close, we drop `stream` here; the next probe will dial fresh.

        if code == 204 {
            ProbeOutcome::Connected { rtt_ms, tcp_reused }
        } else {
            ProbeOutcome::Limited { rtt_ms, http_code: code, tcp_reused }
        }
    }
}

fn parse_status_code(line: &str) -> Option<u16> {
    let mut parts = line.split_whitespace();
    let _proto = parts.next()?;
    let code = parts.next()?;
    code.parse().ok()
}

fn map_io_err(e: std::io::Error) -> DownReason {
    use std::io::ErrorKind::*;
    match e.kind() {
        TimedOut | WouldBlock => DownReason::Timeout,
        ConnectionRefused => DownReason::Refused,
        ConnectionReset | BrokenPipe | UnexpectedEof => DownReason::Reset,
        NotFound => DownReason::Dns,
        _ => DownReason::Reset,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::sync::mpsc;
    use std::thread;

    /// Spawn a keep-alive-aware HTTP stub server on 127.0.0.1:<chosen port>.
    ///
    /// Each accepted connection is served in a loop: drain request headers, send
    /// the next response from `responses` (cycling), then check whether the
    /// response contained `Connection: close`. If so, drop the socket so the
    /// client sees EOF and must dial fresh next time; otherwise keep the socket
    /// open to serve additional requests on the same connection — matching the
    /// real HTTP/1.1 keep-alive contract that `KeepAliveClient` depends on.
    fn spawn_server(
        responses: Vec<&'static str>,
    ) -> (u16, mpsc::Sender<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let (shutdown_tx, shutdown_rx) = mpsc::channel();
        thread::spawn(move || {
            use std::io::{BufRead, BufReader, Write};
            use std::sync::{Arc, Mutex};

            let idx = Arc::new(Mutex::new(0usize));
            listener.set_nonblocking(true).ok();
            loop {
                if shutdown_rx.try_recv().is_ok() { break; }
                match listener.accept() {
                    Ok((stream, _)) => {
                        let responses = responses.clone();
                        let idx = Arc::clone(&idx);
                        thread::spawn(move || {
                            stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
                            stream.set_write_timeout(Some(Duration::from_secs(2))).ok();
                            let mut reader = BufReader::new(stream);
                            loop {
                                // Drain request headers until \r\n\r\n
                                let mut header_done = false;
                                for _ in 0..100 {
                                    let mut line = String::new();
                                    match reader.read_line(&mut line) {
                                        Ok(0) | Err(_) => return, // client closed
                                        Ok(_) => {}
                                    }
                                    if line == "\r\n" || line == "\n" {
                                        header_done = true;
                                        break;
                                    }
                                }
                                if !header_done { return; }

                                // Pick next response
                                let resp = {
                                    let mut i = idx.lock().unwrap();
                                    let r = responses[*i % responses.len()];
                                    *i += 1;
                                    r
                                };

                                // Detect Connection: close in the response we're about to send
                                let close = resp
                                    .lines()
                                    .any(|l| l.to_ascii_lowercase().starts_with("connection:") && l.to_ascii_lowercase().contains("close"));

                                let stream = reader.get_mut();
                                let _ = stream.write_all(resp.as_bytes());
                                let _ = stream.flush();

                                if close {
                                    // Drop stream → client sees EOF → must dial fresh
                                    return;
                                }
                                // Keep looping on the same connection (keep-alive)
                            }
                        });
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5));
                    }
                    Err(_) => break,
                }
            }
        });
        (port, shutdown_tx)
    }

    #[test]
    fn probe_204_returns_connected_first_cycle_not_reused() {
        let (port, _stop) = spawn_server(vec![
            "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n",
        ]);
        let mut c = KeepAliveClient::new(Duration::from_secs(2));
        let url = format!("http://127.0.0.1:{}/204", port);
        let r = c.probe(&url);
        match r {
            ProbeOutcome::Connected { tcp_reused, .. } => assert!(!tcp_reused),
            _ => panic!("expected Connected, got {:?}", r),
        }
    }

    #[test]
    fn probe_204_second_cycle_reuses_connection() {
        let (port, _stop) = spawn_server(vec![
            "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n",
            "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n",
        ]);
        let mut c = KeepAliveClient::new(Duration::from_secs(2));
        let url = format!("http://127.0.0.1:{}/204", port);
        let _ = c.probe(&url);
        let r = c.probe(&url);
        match r {
            ProbeOutcome::Connected { tcp_reused, .. } => assert!(tcp_reused),
            _ => panic!("expected reused Connected, got {:?}", r),
        }
    }

    #[test]
    fn probe_200_with_html_returns_limited() {
        let body = "<html>captive portal</html>";
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: text/html\r\n\r\n{}",
            body.len(), body
        );
        let leaked: &'static str = Box::leak(resp.into_boxed_str());
        let (port, _stop) = spawn_server(vec![leaked]);
        let mut c = KeepAliveClient::new(Duration::from_secs(2));
        let url = format!("http://127.0.0.1:{}/", port);
        match c.probe(&url) {
            ProbeOutcome::Limited { http_code, .. } => assert_eq!(http_code, 200),
            other => panic!("expected Limited, got {:?}", other),
        }
    }

    #[test]
    fn probe_5xx_returns_limited() {
        let resp = "HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n";
        let (port, _stop) = spawn_server(vec![resp]);
        let mut c = KeepAliveClient::new(Duration::from_secs(2));
        let url = format!("http://127.0.0.1:{}/", port);
        match c.probe(&url) {
            ProbeOutcome::Limited { http_code, .. } => assert_eq!(http_code, 502),
            other => panic!("expected Limited 502, got {:?}", other),
        }
    }

    #[test]
    fn probe_unroutable_returns_disconnected_timeout_or_refused() {
        let mut c = KeepAliveClient::new(Duration::from_millis(500));
        // Port 1 is well-known privileged, refused on most hosts
        let url = "http://127.0.0.1:1/";
        match c.probe(url) {
            ProbeOutcome::Disconnected { reason } => {
                assert!(matches!(reason, DownReason::Refused | DownReason::Timeout | DownReason::Reset));
            }
            other => panic!("expected Disconnected, got {:?}", other),
        }
    }

    #[test]
    fn probe_connection_close_drops_keepalive() {
        let (port, _stop) = spawn_server(vec![
            "HTTP/1.1 204 No Content\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
            "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n",
        ]);
        let mut c = KeepAliveClient::new(Duration::from_secs(2));
        let url = format!("http://127.0.0.1:{}/", port);
        let _ = c.probe(&url);
        // Second probe should NOT be tcp_reused since first response had Connection: close
        let r = c.probe(&url);
        match r {
            ProbeOutcome::Connected { tcp_reused, .. } => assert!(!tcp_reused),
            _ => panic!("expected Connected, got {:?}", r),
        }
    }

    #[test]
    fn parse_status_code_extracts_204() {
        assert_eq!(parse_status_code("HTTP/1.1 204 No Content\r\n"), Some(204));
        assert_eq!(parse_status_code("HTTP/1.0 200 OK\r\n"), Some(200));
        assert_eq!(parse_status_code("garbage"), None);
    }
}
