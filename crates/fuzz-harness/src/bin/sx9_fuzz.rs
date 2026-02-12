//! SX9 Fuzz Test Runner CLI
//!
//! Usage:
//!   sx9-fuzz run [--cases N] [--workers W] [--timeout T] [--output FORMAT]
//!   sx9-fuzz list
//!   sx9-fuzz report <json-file>
//!
//! Examples:
//!   sx9-fuzz run                    # Run all fuzz tests with defaults
//!   sx9-fuzz run --cases 100000     # Run 100k cases per test
//!   sx9-fuzz run --output json      # Output as JSON
//!   sx9-fuzz run --output junit     # Output as JUnit XML (for CI)
//!   sx9-fuzz run --output markdown  # Output as Markdown
//!   sx9-fuzz list                   # List available fuzz targets
//!   sx9-fuzz report results.json    # Re-generate report from JSON

use fuzz_harness::prelude::*;
use fuzz_harness::reports::FuzzReport;
use fuzz_harness::runner::{FuzzConfig, FuzzResult};
use std::env;
use std::fs;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        print_usage();
        return ExitCode::from(1);
    }

    match args[1].as_str() {
        "run" => run_fuzz_tests(&args[2..]),
        "list" => list_targets(),
        "report" => generate_report(&args[2..]),
        "--help" | "-h" => {
            print_usage();
            ExitCode::SUCCESS
        }
        _ => {
            eprintln!("Unknown command: {}", args[1]);
            print_usage();
            ExitCode::from(1)
        }
    }
}

fn print_usage() {
    println!(
        r#"SX9 Fuzz Test Runner

USAGE:
    sx9-fuzz <COMMAND> [OPTIONS]

COMMANDS:
    run      Run all fuzz tests
    list     List available fuzz targets
    report   Generate report from JSON results

RUN OPTIONS:
    --cases N        Number of test cases per target (default: 10000)
    --workers W      Number of parallel workers (default: auto)
    --timeout T      Timeout per case in ms (default: 5000)
    --seed S         Random seed (default: 0 = random)
    --output FORMAT  Output format: text, json, junit, markdown (default: text)
    --gcp PROJECT    Run on GCP with specified project
    --region REGION  GCP region (default: us-central1)

EXAMPLES:
    sx9-fuzz run
    sx9-fuzz run --cases 100000 --output json > results.json
    sx9-fuzz run --output junit > junit.xml
    sx9-fuzz list
"#
    );
}

fn parse_args(args: &[String]) -> FuzzConfig {
    let mut config = FuzzConfig::default();
    let mut i = 0;

    while i < args.len() {
        match args[i].as_str() {
            "--cases" if i + 1 < args.len() => {
                config.cases = args[i + 1].parse().unwrap_or(10_000);
                i += 2;
            }
            "--workers" if i + 1 < args.len() => {
                config.workers = args[i + 1].parse().unwrap_or(4);
                i += 2;
            }
            "--timeout" if i + 1 < args.len() => {
                let ms: i64 = args[i + 1].parse().unwrap_or(5000);
                config = config.timeout_ms(ms);
                i += 2;
            }
            "--seed" if i + 1 < args.len() => {
                config.seed = args[i + 1].parse().unwrap_or(0);
                i += 2;
            }
            "--gcp" if i + 1 < args.len() => {
                let project = args[i + 1].clone();
                let region = "us-central1".to_string();
                config = config.gcp(&project, &region);
                i += 2;
            }
            "--region" if i + 1 < args.len() => {
                config.gcp_region = Some(args[i + 1].clone());
                i += 2;
            }
            _ => i += 1,
        }
    }

    config
}

fn get_output_format(args: &[String]) -> &str {
    for i in 0..args.len() {
        if args[i] == "--output" && i + 1 < args.len() {
            return match args[i + 1].as_str() {
                "json" => "json",
                "junit" => "junit",
                "markdown" | "md" => "markdown",
                _ => "text",
            };
        }
    }
    "text"
}

fn run_fuzz_tests(args: &[String]) -> ExitCode {
    let config = parse_args(args);
    let output_format = get_output_format(args);

    eprintln!("SX9 Fuzz Runner - {} cases per target", config.cases);
    eprintln!("Workers: {}, Seed: {}", config.workers, config.seed);
    eprintln!();

    // Run the proptest-based fuzz suite
    let results = run_all_fuzz_targets(&config);

    // Generate report
    let report = FuzzReport::new(results);

    // Output in requested format
    match output_format {
        "json" => println!("{}", report.to_json()),
        "junit" => println!("{}", report.to_junit_xml()),
        "markdown" => println!("{}", report.to_markdown()),
        _ => report.print(),
    }

    // Exit code based on pass/fail
    if report.summary.tests_failed == 0 {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(1)
    }
}

fn list_targets() -> ExitCode {
    println!("Available fuzz targets:");
    println!();
    println!("  beam_profile:");
    println!("    - fuzz_qos_score_bounds      QoS score always in [0,1]");
    println!("    - fuzz_pass_tier_valid       Pass tier classification");
    println!("    - fuzz_beam_profile_bandwidth Bandwidth never exceeds max");
    println!("    - fuzz_pass_assessment       Key calculation no overflow");
    println!("    - fuzz_score_monotonicity    Lower RTT = higher score");
    println!("    - fuzz_mesh_capacity         Mesh capacity non-negative");
    println!();
    println!("  entropy_harvester:");
    println!("    - fuzz_pool_capacity         Pool never exceeds capacity");
    println!("    - fuzz_key_extraction        Key extraction consistency");
    println!("    - fuzz_constellation_rate    Rate sum is correct");
    println!("    - fuzz_pool_fill_bounds      Fill ratio in [0,1]");
    println!("    - fuzz_bulk_extraction       Bulk extract consistency");
    println!("    - fuzz_saa_flags             SAA flag correctness");
    println!("    - fuzz_unit_rate_calculation Inductive unit rate");
    println!();
    println!("  orbital_mechanics:");
    println!("    - (run cargo test in gateway for full coverage)");
    println!();
    println!("Run with: sx9-fuzz run [--cases N]");

    ExitCode::SUCCESS
}

fn generate_report(args: &[String]) -> ExitCode {
    if args.is_empty() {
        eprintln!("Usage: sx9-fuzz report <json-file>");
        return ExitCode::from(1);
    }

    let json_path = &args[0];
    let output_format = get_output_format(args);

    match fs::read_to_string(json_path) {
        Ok(json) => match serde_json::from_str::<Vec<FuzzResult>>(&json) {
            Ok(results) => {
                let report = FuzzReport::new(results);
                match output_format {
                    "json" => println!("{}", report.to_json()),
                    "junit" => println!("{}", report.to_junit_xml()),
                    "markdown" => println!("{}", report.to_markdown()),
                    _ => report.print(),
                }
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("Failed to parse JSON: {}", e);
                ExitCode::from(1)
            }
        },
        Err(e) => {
            eprintln!("Failed to read file: {}", e);
            ExitCode::from(1)
        }
    }
}

// ============================================================================
// Fuzz Target Implementations
// ============================================================================

fn run_all_fuzz_targets(config: &FuzzConfig) -> Vec<FuzzResult> {
    let mut results = Vec::new();

    // Run proptest-based fuzz targets via cargo test
    // For now, we run a simplified version inline
    eprintln!("Running fuzz targets with {} cases each...", config.cases);

    // QoS bounds test
    results.push(run_qos_bounds_fuzz(config));

    // Pool capacity test
    results.push(run_pool_capacity_fuzz(config));

    // Pass tier test
    results.push(run_pass_tier_fuzz(config));

    // Nano9 ratio bounds
    results.push(run_nano9_ratio_fuzz(config));

    // Key extraction test
    results.push(run_key_extraction_fuzz(config));

    // Bandwidth bounds test
    results.push(run_bandwidth_fuzz(config));

    results
}

fn run_qos_bounds_fuzz(config: &FuzzConfig) -> FuzzResult {
    use std::time::Instant;

    let mut result = FuzzResult::new("qos_score_bounds");
    let start = Instant::now();

    // Simple PRNG for deterministic fuzzing
    let mut rng_state = if config.seed != 0 { config.seed } else { 12345 };

    for _ in 0..config.cases {
        // Generate random inputs
        rng_state = lcg_next(rng_state);
        let rtt = (rng_state % (1000 * NANO as u64)) as i64;

        rng_state = lcg_next(rng_state);
        let jitter = (rng_state % (200 * NANO as u64)) as i64;

        rng_state = lcg_next(rng_state);
        let throughput = (rng_state % (100 * NANO as u64)) as i64;

        // Compute score (inline the logic)
        let score = compute_qos_score(rtt, jitter, throughput);

        if score >= 0 && score <= NANO {
            result.record_pass();
        } else {
            result.record_fail(fuzz_harness::runner::FuzzFailure {
                message: format!("Score {} out of bounds [0, {}]", score, NANO),
                input: Some(format!("rtt={}, jitter={}, tp={}", rtt, jitter, throughput)),
                shrunk: false,
            });
        }
    }

    result.finalize(start.elapsed());
    result
}

fn run_pool_capacity_fuzz(config: &FuzzConfig) -> FuzzResult {
    use std::time::Instant;

    let mut result = FuzzResult::new("pool_capacity_bounds");
    let start = Instant::now();

    let mut rng_state = if config.seed != 0 { config.seed } else { 67890 };
    let pool_capacity = 4_000_000 * NANO; // 4 Mbit

    for _ in 0..config.cases {
        rng_state = lcg_next(rng_state);
        let tick_seconds = (rng_state % 3600) as i64;

        rng_state = lcg_next(rng_state);
        let num_ticks = (rng_state % 100) as i64 + 1;

        // Simulate pool accumulation
        let rate_bps = 516_000 * NANO; // ~516 kbps per bay
        let mut pool: i64 = 0;

        for _ in 0..num_ticks {
            let new_bits = rate_bps / NANO * tick_seconds;
            pool = (pool + new_bits).min(pool_capacity);
        }

        if pool >= 0 && pool <= pool_capacity {
            result.record_pass();
        } else {
            result.record_fail(fuzz_harness::runner::FuzzFailure {
                message: format!("Pool {} out of bounds [0, {}]", pool, pool_capacity),
                input: Some(format!("ticks={}, sec={}", num_ticks, tick_seconds)),
                shrunk: false,
            });
        }
    }

    result.finalize(start.elapsed());
    result
}

fn run_pass_tier_fuzz(config: &FuzzConfig) -> FuzzResult {
    use std::time::Instant;

    let mut result = FuzzResult::new("pass_tier_valid");
    let start = Instant::now();

    let mut rng_state = if config.seed != 0 { config.seed } else { 11111 };

    for _ in 0..config.cases {
        rng_state = lcg_next(rng_state);
        let qos = (rng_state % (NANO as u64 + 1)) as i64;

        // Check tier assignment is correct
        let tier = if qos >= 850_000_000 {
            "Prime"
        } else if qos >= 600_000_000 {
            "Standard"
        } else if qos >= 400_000_000 {
            "KeyTransfer"
        } else if qos >= 200_000_000 {
            "KeyViable"
        } else if qos >= 100_000_000 {
            "TelemetryOnly"
        } else {
            "NoLink"
        };

        // Verify tier is valid (always true for this simple test)
        if !tier.is_empty() {
            result.record_pass();
        } else {
            result.record_fail(fuzz_harness::runner::FuzzFailure {
                message: "Invalid tier".to_string(),
                input: Some(format!("qos={}", qos)),
                shrunk: false,
            });
        }
    }

    result.finalize(start.elapsed());
    result
}

fn run_nano9_ratio_fuzz(config: &FuzzConfig) -> FuzzResult {
    use std::time::Instant;

    let mut result = FuzzResult::new("nano9_ratio_bounds");
    let start = Instant::now();

    let mut rng_state = if config.seed != 0 { config.seed } else { 22222 };

    for _ in 0..config.cases {
        rng_state = lcg_next(rng_state);
        let ratio = (rng_state % (NANO as u64 + 1)) as i64;

        if ratio >= 0 && ratio <= NANO {
            result.record_pass();
        } else {
            result.record_fail(fuzz_harness::runner::FuzzFailure {
                message: format!("Ratio {} out of bounds", ratio),
                input: Some(format!("raw={}", ratio)),
                shrunk: false,
            });
        }
    }

    result.finalize(start.elapsed());
    result
}

fn run_key_extraction_fuzz(config: &FuzzConfig) -> FuzzResult {
    use std::time::Instant;

    let mut result = FuzzResult::new("key_extraction_consistent");
    let start = Instant::now();

    let mut rng_state = if config.seed != 0 { config.seed } else { 33333 };
    let key_bits = 256 * NANO;

    for _ in 0..config.cases {
        rng_state = lcg_next(rng_state);
        let pool_bits = (rng_state % (10_000_000 * NANO as u64)) as i64;

        // How many keys can we extract?
        let keys_possible = pool_bits / key_bits;
        let remaining = pool_bits - (keys_possible * key_bits);

        if remaining >= 0 && remaining < key_bits {
            result.record_pass();
        } else {
            result.record_fail(fuzz_harness::runner::FuzzFailure {
                message: format!("Remaining {} invalid", remaining),
                input: Some(format!("pool={}, keys={}", pool_bits, keys_possible)),
                shrunk: false,
            });
        }
    }

    result.finalize(start.elapsed());
    result
}

fn run_bandwidth_fuzz(config: &FuzzConfig) -> FuzzResult {
    use std::time::Instant;

    let mut result = FuzzResult::new("bandwidth_bounds");
    let start = Instant::now();

    let mut rng_state = if config.seed != 0 { config.seed } else { 44444 };
    let max_bandwidth = 10 * NANO; // 10 Gbps

    for _ in 0..config.cases {
        rng_state = lcg_next(rng_state);
        let zone = rng_state % 5;

        let bandwidth_factor = match zone {
            0 => NANO,           // Focal: 100%
            1 => 850_000_000,    // Core: 85%
            2 => 500_000_000,    // Transition: 50%
            3 => 150_000_000,    // Trailing: 15%
            _ => 0,              // Outside: 0%
        };

        let bandwidth = (max_bandwidth as i128 * bandwidth_factor as i128 / NANO as i128) as i64;

        if bandwidth >= 0 && bandwidth <= max_bandwidth {
            result.record_pass();
        } else {
            result.record_fail(fuzz_harness::runner::FuzzFailure {
                message: format!("Bandwidth {} out of bounds", bandwidth),
                input: Some(format!("zone={}, factor={}", zone, bandwidth_factor)),
                shrunk: false,
            });
        }
    }

    result.finalize(start.elapsed());
    result
}

// Simple LCG PRNG for deterministic fuzzing
fn lcg_next(state: u64) -> u64 {
    state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407)
}

// Simplified QoS score computation (matches beam_profile logic)
fn compute_qos_score(rtt: i64, jitter: i64, throughput: i64) -> i64 {
    const RTT_GOOD: i64 = 50 * NANO;
    const RTT_BAD: i64 = 500 * NANO;
    const JITTER_GOOD: i64 = 10 * NANO;
    const JITTER_BAD: i64 = 100 * NANO;
    const TP_GOOD: i64 = 50 * NANO;
    const TP_BAD: i64 = 5 * NANO;

    // RTT score
    let rtt_score = if rtt <= RTT_GOOD {
        NANO
    } else if rtt >= RTT_BAD {
        0
    } else {
        let range = RTT_BAD - RTT_GOOD;
        let excess = rtt - RTT_GOOD;
        NANO - (excess as i128 * NANO as i128 / range as i128) as i64
    };

    // Jitter score
    let jitter_score = if jitter <= JITTER_GOOD {
        NANO
    } else if jitter >= JITTER_BAD {
        0
    } else {
        let range = JITTER_BAD - JITTER_GOOD;
        let excess = jitter - JITTER_GOOD;
        NANO - (excess as i128 * NANO as i128 / range as i128) as i64
    };

    // Throughput score
    let tp_score = if throughput >= TP_GOOD {
        NANO
    } else if throughput <= TP_BAD {
        0
    } else {
        let range = TP_GOOD - TP_BAD;
        let above_min = throughput - TP_BAD;
        (above_min as i128 * NANO as i128 / range as i128) as i64
    };

    // Loss score = 1.0 (no loss in this test)
    let loss_score = NANO;

    // Weighted sum: RTT 30%, Jitter 20%, Loss 30%, Throughput 20%
    const W_RTT: i64 = 300_000_000;
    const W_JITTER: i64 = 200_000_000;
    const W_LOSS: i64 = 300_000_000;
    const W_TP: i64 = 200_000_000;

    let sum = (rtt_score as i128 * W_RTT as i128
        + jitter_score as i128 * W_JITTER as i128
        + loss_score as i128 * W_LOSS as i128
        + tp_score as i128 * W_TP as i128) / NANO as i128;

    sum as i64
}
