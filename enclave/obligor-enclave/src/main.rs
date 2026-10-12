//! Obligor Monad TEE Enclave (AWS Nitro / Marlin Oyster)
//!
//! Runs the identical two-party netting formula inside an isolated enclave and
//! produces attested outputs. The math is integer-based (cents + basis points)
//! so results are deterministic and free of floating-point accumulation drift,
//! and bucket ordering is stable (sorted by IM, ties in input order) so the
//! same inputs always yield the same bytes.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;
use std::time::Duration;

/// Money fixed-point scale: 1 USD = 100 cents.
const CENTS: i64 = 100;
/// Haircut scale: 1.0 = 10_000 basis points.
const BPS: i64 = 10_000;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PositionLeg {
    pub party: String,
    pub venue: String,
    pub instrument: String,
    pub bucket: String,
    pub side: String,
    pub qty: f64,
    pub notional_usd: f64,
    pub signed_exposure_usd: f64,
    pub haircut: f64,
    pub mark_usd: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EnclaveNettingRequest {
    pub session_id: String,
    pub party_a_legs: Vec<PositionLeg>,
    pub party_b_legs: Vec<PositionLeg>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BucketResult {
    pub bucket: String,
    pub exposure_usd: f64,
    pub haircut: f64,
    pub im_usd: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AttestationQuote {
    pub provider: String,
    pub verified: bool,
    pub quote_hex: String,
    pub pcr0: String,
    pub measurement: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EnclaveNettingResponse {
    pub session_id: String,
    pub siloed_a_usd: f64,
    pub siloed_b_usd: f64,
    pub siloed_combined_usd: f64,
    pub netted_combined_usd: f64,
    pub savings_usd: f64,
    pub gross_notional_usd: f64,
    pub net_exposure_usd: f64,
    pub buckets: Vec<BucketResult>,
    pub attestation: AttestationQuote,
}

fn to_cents(usd: f64) -> i64 {
    if !usd.is_finite() {
        return 0;
    }
    (usd * CENTS as f64).round() as i64
}

fn to_bps(haircut: f64) -> i64 {
    if !haircut.is_finite() || haircut < 0.0 {
        return 0;
    }
    (haircut * BPS as f64).round() as i64
}

/// hair_cents = |cents| * bps / 10_000, rounded half-up, saturating.
fn im_cents(abs_cents: i64, bps: i64) -> i64 {
    let raw = abs_cents.saturating_mul(bps).saturating_add(BPS / 2);
    raw / BPS
}

fn usd_from_cents(cents: i64) -> f64 {
    cents as f64 / CENTS as f64
}

fn siloed_im_cents(legs: &[PositionLeg]) -> i64 {
    legs.iter()
        .map(|leg| im_cents(to_cents(leg.notional_usd).abs(), to_bps(leg.haircut)))
        .fold(0i64, |acc, v| acc.saturating_add(v))
}

struct BucketAcc {
    exposure_cents: i64,
    haircut_bps: i64,
    notional_cents: i64,
}

pub fn compute_two_party_netted(
    session_id: &str,
    party_a_legs: &[PositionLeg],
    party_b_legs: &[PositionLeg],
) -> EnclaveNettingResponse {
    let siloed_a = siloed_im_cents(party_a_legs);
    let siloed_b = siloed_im_cents(party_b_legs);
    let siloed_combined = siloed_a.saturating_add(siloed_b);

    // Insertion-ordered buckets: a Vec (stable order) + name → index map.
    // Buckets are accumulated in integer cents so results are deterministic.
    let mut order: Vec<(String, BucketAcc)> = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();

    let mut total_net_exposure = 0i64;
    let mut total_gross_notional = 0i64;

    for leg in party_a_legs.iter().chain(party_b_legs.iter()) {
        let exp = to_cents(leg.signed_exposure_usd);
        let notional = to_cents(leg.notional_usd);
        let hbps = to_bps(leg.haircut);

        total_net_exposure = total_net_exposure.saturating_add(exp);
        total_gross_notional = total_gross_notional.saturating_add(notional);

        let idx = match index.get(&leg.bucket) {
            Some(i) => *i,
            None => {
                let i = order.len();
                index.insert(leg.bucket.clone(), i);
                order.push((
                    leg.bucket.clone(),
                    BucketAcc { exposure_cents: 0, haircut_bps: hbps, notional_cents: 0 },
                ));
                i
            }
        };
        let acc = &mut order[idx].1;
        acc.exposure_cents = acc.exposure_cents.saturating_add(exp);
        acc.notional_cents = acc.notional_cents.saturating_add(notional);
        if hbps > acc.haircut_bps {
            acc.haircut_bps = hbps;
        }
    }

    let mut netted_combined = 0i64;
    let mut bucket_results: Vec<(i64, BucketResult)> = Vec::with_capacity(order.len());
    for (bucket_name, acc) in order.into_iter() {
        let im = im_cents(acc.exposure_cents.saturating_abs(), acc.haircut_bps);
        netted_combined = netted_combined.saturating_add(im);
        bucket_results.push((
            im,
            BucketResult {
                bucket: bucket_name,
                exposure_usd: usd_from_cents(acc.exposure_cents),
                haircut: acc.haircut_bps as f64 / BPS as f64,
                im_usd: usd_from_cents(im),
            },
        ));
    }
    // Stable sort by IM desc — ties keep input order, matching the Node path.
    bucket_results.sort_by(|a, b| b.0.cmp(&a.0));
    let buckets: Vec<BucketResult> = bucket_results.into_iter().map(|(_, b)| b).collect();

    let savings = (siloed_combined - netted_combined).max(0);

    // SHA256 digest of the computation inputs/outputs — proof-of-execution
    // binding, NOT a hardware attestation. A real Nitro/Oyster NSM call
    // replaces this once the enclave binary boots inside a real enclave VM,
    // and `verified` flips on the HOST verifier — never hardcoded here.
    let mut hasher = Sha256::new();
    hasher.update(session_id.as_bytes());
    hasher.update(siloed_combined.to_le_bytes());
    hasher.update(netted_combined.to_le_bytes());
    let measurement = hex::encode(hasher.finalize());

    EnclaveNettingResponse {
        session_id: session_id.to_string(),
        siloed_a_usd: usd_from_cents(siloed_a),
        siloed_b_usd: usd_from_cents(siloed_b),
        siloed_combined_usd: usd_from_cents(siloed_combined),
        netted_combined_usd: usd_from_cents(netted_combined),
        savings_usd: usd_from_cents(savings),
        gross_notional_usd: usd_from_cents(total_gross_notional),
        net_exposure_usd: usd_from_cents(total_net_exposure),
        buckets,
        attestation: AttestationQuote {
            // Honest default: this build cannot issue a hardware attestation
            // outside a real enclave VM. The host verifies quotes and flips
            // `verified` only from a genuine NSM/Nitro attestation document.
            provider: "none".to_string(),
            verified: false,
            quote_hex: String::new(),
            pcr0: String::new(),
            measurement,
        },
    }
}

static ACTIVE: AtomicUsize = AtomicUsize::new(0);
const MAX_CONNECTIONS: usize = 128;

fn main() {
    let addr = std::env::var("OBLIGOR_ENCLAVE_ADDR").unwrap_or_else(|_| "127.0.0.1:5000".to_string());
    let listener = match TcpListener::bind(&addr) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Obligor TEE Enclave failed to bind {addr}: {e}");
            std::process::exit(1);
        }
    };
    println!("Obligor TEE Enclave initialized. Listening on {addr} (HTTP: GET /health, POST /net)");

    for stream in listener.incoming() {
        match stream {
            Ok(s) => {
                // Bounded concurrency: refuse overload instead of spawning an
                // unbounded number of threads (connection-flood DoS guard).
                if ACTIVE.load(Ordering::SeqCst) >= MAX_CONNECTIONS {
                    let mut s = s;
                    respond(&mut s, 503, "{\"ok\":false,\"error\":\"too many connections\"}");
                    continue;
                }
                ACTIVE.fetch_add(1, Ordering::SeqCst);
                thread::spawn(move || {
                    handle_connection(s);
                    ACTIVE.fetch_sub(1, Ordering::SeqCst);
                });
            }
            Err(e) => eprintln!("enclave accept error: {e}"),
        }
    }
}

/// Minimal HTTP/1.1 handler — no external crates so the enclave surface stays
/// auditable. Handles GET /health and POST /net (JSON), Connection: close.
fn handle_connection(mut stream: TcpStream) {
    // Bound how long a slow client can hold a worker thread.
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));

    let mut buf = Vec::new();
    // Read headers (up to the blank line) in bounded chunks.
    let mut header_end = None;
    let mut chunk = [0u8; 4096];
    while header_end.is_none() {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                header_end = find_subsequence(&buf, b"\r\n\r\n").map(|i| i + 4);
                if buf.len() > 1024 * 1024 {
                    break;
                }
            }
            Err(_) => return,
        }
    }
    let header_end = match header_end {
        Some(i) => i,
        None => {
            respond(&mut stream, 400, "{\"ok\":false,\"error\":\"bad request\"}");
            return;
        }
    };

    let head = String::from_utf8_lossy(&buf[..header_end]).to_string();
    let mut lines = head.lines();
    let request_line = lines.next().unwrap_or("");
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("");

    let content_length: usize = lines
        .filter_map(|l| {
            let lower = l.to_ascii_lowercase();
            if let Some(rest) = lower.strip_prefix("content-length:") {
                rest.trim().parse::<usize>().ok()
            } else {
                None
            }
        })
        .next()
        .unwrap_or(0)
        .min(4 * 1024 * 1024);

    // Read the remaining body up to content_length.
    let mut body = buf[header_end..].to_vec();
    while body.len() < content_length {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => body.extend_from_slice(&chunk[..n]),
            Err(_) => break,
        }
    }
    body.truncate(content_length);

    match (method, path) {
        ("GET", "/health") => respond(
            &mut stream,
            200,
            "{\"ok\":true,\"service\":\"obligor-enclave\",\"hardware_attestation_available\":false}",
        ),
        ("POST", "/net") => {
            let req: Result<EnclaveNettingRequest, _> = serde_json::from_slice(&body);
            match req {
                Ok(r) => {
                    let resp = compute_two_party_netted(&r.session_id, &r.party_a_legs, &r.party_b_legs);
                    match serde_json::to_string(&resp) {
                        Ok(json) => respond(&mut stream, 200, &json),
                        Err(e) => respond(
                            &mut stream,
                            500,
                            &format!("{{\"ok\":false,\"error\":\"serialize: {e}\"}}"),
                        ),
                    }
                }
                Err(e) => respond(
                    &mut stream,
                    422,
                    &format!("{{\"ok\":false,\"error\":\"invalid netting request: {e}\"}}"),
                ),
            }
        }
        _ => respond(&mut stream, 404, "{\"ok\":false,\"error\":\"not found\"}"),
    }
}

fn respond(stream: &mut TcpStream, status: u16, body: &str) {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        422 => "Unprocessable Entity",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        _ => "OK",
    };
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}
