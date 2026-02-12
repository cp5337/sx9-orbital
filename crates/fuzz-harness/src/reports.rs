//! Fuzz test reporting and export
//!
//! Generates reports in various formats for CI/CD integration.

use crate::runner::FuzzResult;
use serde::{Deserialize, Serialize};
use sx9_foundation_primitives::{Nano9, NANO};

// ============================================================================
// Report Formats
// ============================================================================

/// Full test report
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FuzzReport {
    /// Report timestamp (Unix ms)
    pub timestamp_ms: i64,
    /// Git commit hash
    pub git_commit: Option<String>,
    /// Branch name
    pub git_branch: Option<String>,
    /// Test environment
    pub environment: String,
    /// Total duration (ms as Nano9)
    pub total_duration_ms: Nano9,
    /// All test results
    pub results: Vec<FuzzResult>,
    /// Summary stats
    pub summary: ReportSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportSummary {
    pub total_tests: u32,
    pub tests_passed: u32,
    pub tests_failed: u32,
    pub total_cases: u64,
    pub cases_passed: u64,
    pub cases_failed: u64,
    /// Average throughput (cases/sec as Nano9)
    pub avg_throughput: Nano9,
    pub pass_rate: Nano9, // 0-1 as Nano9
}

impl FuzzReport {
    pub fn new(results: Vec<FuzzResult>) -> Self {
        let total_tests = results.len() as u32;
        let tests_passed = results.iter().filter(|r| r.passed).count() as u32;
        let tests_failed = total_tests - tests_passed;

        let total_cases: u64 = results.iter().map(|r| r.cases_run).sum();
        let cases_passed: u64 = results.iter().map(|r| r.cases_passed).sum();
        let cases_failed: u64 = results.iter().map(|r| r.cases_failed).sum();

        let total_duration_ms: i64 = results.iter().map(|r| r.duration_ms.0).sum();

        let avg_throughput = if total_tests > 0 {
            let sum: i64 = results.iter().map(|r| r.throughput.0).sum();
            Nano9(sum / total_tests as i64)
        } else {
            Nano9::ZERO
        };

        let pass_rate = if total_cases > 0 {
            Nano9((cases_passed as i128 * NANO as i128 / total_cases as i128) as i64)
        } else {
            Nano9::ZERO
        };

        Self {
            timestamp_ms: chrono::Utc::now().timestamp_millis(),
            git_commit: git_commit(),
            git_branch: git_branch(),
            environment: environment_name(),
            total_duration_ms: Nano9(total_duration_ms),
            results,
            summary: ReportSummary {
                total_tests,
                tests_passed,
                tests_failed,
                total_cases,
                cases_passed,
                cases_failed,
                avg_throughput,
                pass_rate,
            },
        }
    }

    /// Export as JSON
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }

    /// Export as compact JSON (for CI)
    pub fn to_json_compact(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }

    /// Export as JUnit XML (for CI systems)
    pub fn to_junit_xml(&self) -> String {
        let mut xml = String::new();
        xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        xml.push_str(&format!(
            "<testsuites tests=\"{}\" failures=\"{}\" time=\"{}\">\n",
            self.summary.total_cases,
            self.summary.cases_failed,
            self.total_duration_ms.0 / NANO / 1000 // seconds
        ));

        for result in &self.results {
            xml.push_str(&format!(
                "  <testsuite name=\"{}\" tests=\"{}\" failures=\"{}\" time=\"{}\">\n",
                result.name,
                result.cases_run,
                result.cases_failed,
                result.duration_ms.0 / NANO / 1000
            ));

            if result.passed {
                xml.push_str(&format!(
                    "    <testcase name=\"{}\" time=\"{}\"/>\n",
                    result.name,
                    result.duration_ms.0 / NANO / 1000
                ));
            } else {
                xml.push_str(&format!(
                    "    <testcase name=\"{}\" time=\"{}\">\n",
                    result.name,
                    result.duration_ms.0 / NANO / 1000
                ));
                for failure in &result.failures {
                    xml.push_str(&format!(
                        "      <failure message=\"{}\">{}</failure>\n",
                        escape_xml(&failure.message),
                        failure.input.as_deref().unwrap_or("")
                    ));
                }
                xml.push_str("    </testcase>\n");
            }

            xml.push_str("  </testsuite>\n");
        }

        xml.push_str("</testsuites>\n");
        xml
    }

    /// Export as Markdown summary
    pub fn to_markdown(&self) -> String {
        let mut md = String::new();

        md.push_str("# Fuzz Test Report\n\n");
        md.push_str(&format!("**Date:** {}\n", chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")));
        if let Some(ref commit) = self.git_commit {
            md.push_str(&format!("**Commit:** `{}`\n", commit));
        }
        if let Some(ref branch) = self.git_branch {
            md.push_str(&format!("**Branch:** `{}`\n", branch));
        }
        md.push_str(&format!("**Environment:** {}\n\n", self.environment));

        md.push_str("## Summary\n\n");
        md.push_str("| Metric | Value |\n");
        md.push_str("|--------|-------|\n");
        md.push_str(&format!("| Tests | {} ({} passed, {} failed) |\n",
            self.summary.total_tests, self.summary.tests_passed, self.summary.tests_failed));
        md.push_str(&format!("| Cases | {} ({} passed, {} failed) |\n",
            self.summary.total_cases, self.summary.cases_passed, self.summary.cases_failed));
        md.push_str(&format!("| Pass Rate | {:.2}% |\n",
            self.summary.pass_rate.0 as f64 / NANO as f64 * 100.0));
        md.push_str(&format!("| Throughput | {} cases/sec |\n",
            self.summary.avg_throughput.0 / NANO));
        md.push_str(&format!("| Duration | {} ms |\n\n",
            self.total_duration_ms.0 / NANO));

        md.push_str("## Results\n\n");
        md.push_str("| Test | Cases | Passed | Failed | Status |\n");
        md.push_str("|------|-------|--------|--------|--------|\n");

        for result in &self.results {
            let status = if result.passed { "✓" } else { "✗" };
            md.push_str(&format!("| {} | {} | {} | {} | {} |\n",
                result.name, result.cases_run, result.cases_passed, result.cases_failed, status));
        }

        // Failures section
        let failed_tests: Vec<_> = self.results.iter().filter(|r| !r.passed).collect();
        if !failed_tests.is_empty() {
            md.push_str("\n## Failures\n\n");
            for result in failed_tests {
                md.push_str(&format!("### {}\n\n", result.name));
                for (i, failure) in result.failures.iter().enumerate().take(3) {
                    md.push_str(&format!("{}. `{}`\n", i + 1, failure.message));
                    if let Some(ref input) = failure.input {
                        md.push_str(&format!("   - Input: `{}`\n", input));
                    }
                }
                if result.failures.len() > 3 {
                    md.push_str(&format!("   - ... and {} more\n", result.failures.len() - 3));
                }
                md.push_str("\n");
            }
        }

        md
    }

    /// Print to console
    pub fn print(&self) {
        println!("{}", self.to_markdown());
    }
}

// ============================================================================
// Helpers
// ============================================================================

fn git_commit() -> Option<String> {
    std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
}

fn git_branch() -> Option<String> {
    std::process::Command::new("git")
        .args(["branch", "--show-current"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
}

fn environment_name() -> String {
    if std::env::var("CI").is_ok() {
        "CI".to_string()
    } else if std::env::var("GOOGLE_CLOUD_PROJECT").is_ok() {
        "GCP".to_string()
    } else {
        "local".to_string()
    }
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::FuzzResult;

    #[test]
    fn test_report_generation() {
        let mut result = FuzzResult::new("test_example");
        result.cases_run = 1000;
        result.cases_passed = 990;
        result.cases_failed = 10;
        result.duration_ms = Nano9(500 * NANO);
        result.passed = false;

        let report = FuzzReport::new(vec![result]);

        assert_eq!(report.summary.total_tests, 1);
        assert_eq!(report.summary.tests_failed, 1);

        // Test exports don't panic
        let _ = report.to_json();
        let _ = report.to_junit_xml();
        let _ = report.to_markdown();
    }
}
