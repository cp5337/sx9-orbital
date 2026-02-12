// Console logging utilities for WASM debugging
// Module: utils/console.rs | Lines: ~15

#[macro_export]
macro_rules! console_log {
    ($($t:tt)*) => {
        web_sys::console::log_1(&format!($($t)*).into());
    }
}

#[macro_export]
macro_rules! console_error {
    ($($t:tt)*) => {
        web_sys::console::error_1(&format!($($t)*).into());
    }
}
