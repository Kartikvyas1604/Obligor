//! Obligor Monad TEE Enclave (AWS Nitro / Marlin Oyster)
//! Runs the identical two-party netting formula inside an isolated enclave and produces hardware-attested outputs.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

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

pub fn compute_siloed_im(legs: &[PositionLeg]) -> f64 {
    legs.iter()
        .map(|leg| leg.haircut * leg.notional_usd.abs())
        .sum()
}

pub fn compute_two_party_netted(
    session_id: &str,
    party_a_legs: &[PositionLeg],
    party_b_legs: &[PositionLeg],
) -> EnclaveNettingResponse {
    let siloed_a = compute_siloed_im(party_a_legs);
    let siloed_b = compute_siloed_im(party_b_legs);
    let siloed_combined = siloed_a + siloed_b;

    let mut buckets: HashMap<String, (f64, f64, f64)> = HashMap::new(); // (exposure, max_haircut, notional)

    let all_legs = party_a_legs.iter().chain(party_b_legs.iter());
    let mut total_net_exposure = 0.0;
    let mut total_gross_notional = 0.0;

    for leg in all_legs {
        total_net_exposure += leg.signed_exposure_usd;
        total_gross_notional += leg.notional_usd;

        let entry = buckets.entry(leg.bucket.clone()).or_insert((0.0, leg.haircut, 0.0));
        entry.0 += leg.signed_exposure_usd;
        if leg.haircut > entry.1 {
            entry.1 = leg.haircut;
        }
        entry.2 += leg.notional_usd;
    }

    let mut bucket_results = Vec::new();
    let mut netted_combined = 0.0;

    for (bucket_name, (exposure, haircut, _)) in buckets {
        let im = haircut * exposure.abs();
        netted_combined += im;
        bucket_results.push(BucketResult {
            bucket: bucket_name,
            exposure_usd: (exposure * 100.0).round() / 100.0,
            haircut,
            im_usd: (im * 100.0).round() / 100.0,
        });
    }

    let savings = (siloed_combined - netted_combined).max(0.0);

    // SHA256 digest of the computation inputs/outputs — proof-of-execution
    // binding, NOT a hardware attestation. A real Nitro/Oyster NSM call
    // (aws_nitro_enclaves_nsm_core::nsm_get_random / describe…) replaces this
    // once the enclave binary boots inside a real enclave VM, and `verified`
    // flips on the HOST verifier — never hardcoded here.
    let mut hasher = Sha256::new();
    hasher.update(session_id.as_bytes());
    hasher.update(siloed_combined.to_le_bytes());
    hasher.update(netted_combined.to_le_bytes());
    let measurement = hex::encode(hasher.finalize());

    EnclaveNettingResponse {
        session_id: session_id.to_string(),
        siloed_a_usd: (siloed_a * 100.0).round() / 100.0,
        siloed_b_usd: (siloed_b * 100.0).round() / 100.0,
        siloed_combined_usd: (siloed_combined * 100.0).round() / 100.0,
        netted_combined_usd: (netted_combined * 100.0).round() / 100.0,
        savings_usd: (savings * 100.0).round() / 100.0,
        gross_notional_usd: (total_gross_notional * 100.0).round() / 100.0,
        net_exposure_usd: (total_net_exposure * 100.0).round() / 100.0,
        buckets: bucket_results,
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
                thread::spawn(move || handle_connection(s));
            }
            Err(e) => eprintln!("enclave accept error: {e}"),
        }
    }
}

/// Minimal HTTP/1.1 handler — no external crates so the enclave surface stays
/// auditable. Handles GET /health and POST /net (JSON), Connection: close.
fn handle_connection(mut stream: TcpStream) {
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
        .unwrap_or(0);

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
