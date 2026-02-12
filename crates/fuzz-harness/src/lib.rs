//! SX9 Orbital Fuzz Harness
//!
//! Reusable property-based testing infrastructure for the entire orbital codebase.
//! Provides Nano9-native generators, orbital domain strategies, and GCP-scalable runners.
//!
//! # Usage
//!
//! ```rust
//! use fuzz_harness::prelude::*;
//!
//! proptest! {
//!     #[test]
//!     fn my_fuzz_test(qos in nano9_ratio()) {
//!         // Your test here
//!     }
//! }
//! ```

pub mod generators;
pub mod runner;
pub mod reports;

pub mod prelude {
    pub use crate::generators::*;
    pub use crate::runner::{FuzzConfig, FuzzRunner, FuzzResult};
    pub use proptest::prelude::*;
    pub use sx9_foundation_primitives::{Nano9, NANO};
}

// Re-export proptest for convenience
pub use proptest;
