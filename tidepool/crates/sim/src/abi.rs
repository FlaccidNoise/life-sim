//! Every export of the WebAssembly module. No simulation rules live here.

pub const ABI_VERSION: u32 = 1;

#[no_mangle]
pub extern "C" fn tp_abi_version() -> u32 {
    ABI_VERSION
}
