//! Fuzz test runner with GCP scaling support
//!
//! Runs property tests locally or distributes across GCP Compute instances.

use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use sx9_foundation_primitives::{Nano9, NANO};

// ============================================================================
// Configuration
// ============================================================================

/// Fuzz test configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FuzzConfig {
    /// Number of test cases to run
    pub cases: u64,
    /// Maximum shrink iterations on failure
    pub max_shrink_iters: u32,
    /// Timeout per test case (ms as Nano9)
    pub timeout_ms: Nano9,
    /// Random seed (0 = random)
    pub seed: u64,
    /// Number of parallel workers
    pub workers: u32,
    /// GCP project ID (if using cloud)
    pub gcp_project: Option<String>,
    /// GCP region for compute instances
    pub gcp_region: Option<String>,
    /// Instance type for GCP workers
    pub gcp_machine_type: Option<String>,
}

impl Default for FuzzConfig {
    fn default() -> Self {
        Self {
            cases: 10_000,
            max_shrink_iters: 1000,
            timeout_ms: Nano9(5000 * NANO), // 5 seconds
            seed: 0,
            workers: num_cpus(),
            gcp_project: None,
            gcp_region: None,
            gcp_machine_type: None,
        }
    }
}

impl FuzzConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cases(mut self, n: u64) -> Self {
        self.cases = n;
        self
    }

    pub fn workers(mut self, n: u32) -> Self {
        self.workers = n;
        self
    }

    pub fn seed(mut self, s: u64) -> Self {
        self.seed = s;
        self
    }

    pub fn timeout_ms(mut self, ms: i64) -> Self {
        self.timeout_ms = Nano9(ms * NANO);
        self
    }

    pub fn gcp(mut self, project: &str, region: &str) -> Self {
        self.gcp_project = Some(project.to_string());
        self.gcp_region = Some(region.to_string());
        self.gcp_machine_type = Some("e2-standard-4".to_string());
        self
    }

    pub fn gcp_machine(mut self, machine_type: &str) -> Self {
        self.gcp_machine_type = Some(machine_type.to_string());
        self
    }

    /// Generate proptest config from this
    pub fn to_proptest_config(&self) -> proptest::test_runner::Config {
        let mut config = proptest::test_runner::Config::default();
        config.cases = self.cases as u32;
        config.max_shrink_iters = self.max_shrink_iters;
        if self.seed != 0 {
            config.rng_algorithm = proptest::test_runner::RngAlgorithm::ChaCha;
        }
        config
    }
}

// ============================================================================
// Results
// ============================================================================

/// Result of a fuzz test run
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FuzzResult {
    /// Test name
    pub name: String,
    /// Total cases run
    pub cases_run: u64,
    /// Cases that passed
    pub cases_passed: u64,
    /// Cases that failed
    pub cases_failed: u64,
    /// Duration in ms (Nano9)
    pub duration_ms: Nano9,
    /// Cases per second (Nano9)
    pub throughput: Nano9,
    /// Failure details if any
    pub failures: Vec<FuzzFailure>,
    /// Whether test passed overall
    pub passed: bool,
}

impl FuzzResult {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            cases_run: 0,
            cases_passed: 0,
            cases_failed: 0,
            duration_ms: Nano9::ZERO,
            throughput: Nano9::ZERO,
            failures: Vec::new(),
            passed: true,
        }
    }

    pub fn record_pass(&mut self) {
        self.cases_run += 1;
        self.cases_passed += 1;
    }

    pub fn record_fail(&mut self, failure: FuzzFailure) {
        self.cases_run += 1;
        self.cases_failed += 1;
        self.passed = false;
        self.failures.push(failure);
    }

    pub fn finalize(&mut self, duration: Duration) {
        let ms = duration.as_millis() as i64;
        self.duration_ms = Nano9(ms * NANO);
        if ms > 0 {
            self.throughput = Nano9((self.cases_run as i128 * NANO as i128 * 1000 / ms as i128) as i64);
        }
    }

    /// Print summary to stdout
    pub fn print_summary(&self) {
        println!("╔════════════════════════════════════════════════════════════╗");
        println!("║ Fuzz Test: {:<48} ║", self.name);
        println!("╠════════════════════════════════════════════════════════════╣");
        println!("║ Cases: {:>10} | Passed: {:>10} | Failed: {:>10} ║",
            self.cases_run, self.cases_passed, self.cases_failed);
        println!("║ Duration: {:>7} ms | Throughput: {:>10} cases/sec   ║",
            self.duration_ms.0 / NANO, self.throughput.0 / NANO);
        println!("║ Status: {:<52} ║",
            if self.passed { "✓ PASSED" } else { "✗ FAILED" });
        println!("╚════════════════════════════════════════════════════════════╝");

        if !self.failures.is_empty() {
            println!("\nFailures:");
            for (i, f) in self.failures.iter().enumerate().take(5) {
                println!("  [{}] {}", i + 1, f.message);
                if let Some(ref input) = f.input {
                    println!("      Input: {}", input);
                }
            }
            if self.failures.len() > 5 {
                println!("  ... and {} more", self.failures.len() - 5);
            }
        }
    }
}

/// Details of a test failure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FuzzFailure {
    pub message: String,
    pub input: Option<String>,
    pub shrunk: bool,
}

// ============================================================================
// Runner
// ============================================================================

/// Main fuzz test runner
pub struct FuzzRunner {
    config: FuzzConfig,
    results: Vec<FuzzResult>,
}

impl FuzzRunner {
    pub fn new(config: FuzzConfig) -> Self {
        Self {
            config,
            results: Vec::new(),
        }
    }

    pub fn with_default_config() -> Self {
        Self::new(FuzzConfig::default())
    }

    /// Run a fuzz test with the given closure
    pub fn run<F>(&mut self, name: &str, test_fn: F) -> &FuzzResult
    where
        F: Fn(u64) -> Result<(), String>,
    {
        let mut result = FuzzResult::new(name);
        let start = Instant::now();

        for i in 0..self.config.cases {
            match test_fn(i) {
                Ok(()) => result.record_pass(),
                Err(msg) => result.record_fail(FuzzFailure {
                    message: msg,
                    input: Some(format!("case {}", i)),
                    shrunk: false,
                }),
            }
        }

        result.finalize(start.elapsed());
        self.results.push(result);
        self.results.last().unwrap()
    }

    /// Get all results
    pub fn results(&self) -> &[FuzzResult] {
        &self.results
    }

    /// Print summary of all tests
    pub fn print_all_summaries(&self) {
        for result in &self.results {
            result.print_summary();
            println!();
        }

        let total_cases: u64 = self.results.iter().map(|r| r.cases_run).sum();
        let total_passed: u64 = self.results.iter().map(|r| r.cases_passed).sum();
        let total_failed: u64 = self.results.iter().map(|r| r.cases_failed).sum();
        let all_passed = self.results.iter().all(|r| r.passed);

        println!("════════════════════════════════════════════════════════════════");
        println!("TOTAL: {} tests, {} cases, {} passed, {} failed",
            self.results.len(), total_cases, total_passed, total_failed);
        println!("OVERALL: {}", if all_passed { "✓ ALL PASSED" } else { "✗ SOME FAILED" });
        println!("════════════════════════════════════════════════════════════════");
    }

    /// Export results to JSON
    pub fn export_json(&self) -> String {
        serde_json::to_string_pretty(&self.results).unwrap_or_default()
    }
}

// ============================================================================
// GCP Integration
// ============================================================================

/// Distributed fuzz runner for GCP
#[cfg(feature = "gcp")]
pub struct GcpFuzzRunner {
    config: FuzzConfig,
    instances: Vec<String>,
}

#[cfg(feature = "gcp")]
impl GcpFuzzRunner {
    pub async fn new(config: FuzzConfig) -> Result<Self, String> {
        let project = config.gcp_project.as_ref()
            .ok_or("GCP project not configured")?;
        let region = config.gcp_region.as_ref()
            .ok_or("GCP region not configured")?;

        Ok(Self {
            config,
            instances: Vec::new(),
        })
    }

    pub async fn spawn_workers(&mut self, count: u32) -> Result<(), String> {
        // Would spawn GCP Compute instances here
        // For now, this is a placeholder
        Ok(())
    }

    pub async fn distribute_work(&self) -> Result<Vec<FuzzResult>, String> {
        // Would distribute test cases across workers
        Ok(Vec::new())
    }

    pub async fn cleanup(&mut self) -> Result<(), String> {
        // Would terminate GCP instances
        Ok(())
    }
}

// ============================================================================
// Helpers
// ============================================================================

fn num_cpus() -> u32 {
    std::thread::available_parallelism()
        .map(|p| p.get() as u32)
        .unwrap_or(4)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        let config = FuzzConfig::default();
        assert_eq!(config.cases, 10_000);
        assert!(config.workers > 0);
    }

    #[test]
    fn test_runner_basic() {
        let mut runner = FuzzRunner::with_default_config();

        let result = runner.run("test_always_pass", |_| Ok(()));
        assert!(result.passed);
        assert_eq!(result.cases_passed, 10_000);
    }

    #[test]
    fn test_runner_with_failures() {
        let config = FuzzConfig::new().cases(100);
        let mut runner = FuzzRunner::new(config);

        let result = runner.run("test_some_fail", |i| {
            if i % 10 == 0 {
                Err(format!("Failed at {}", i))
            } else {
                Ok(())
            }
        });

        assert!(!result.passed);
        assert_eq!(result.cases_failed, 10);
        assert_eq!(result.cases_passed, 90);
    }
}
