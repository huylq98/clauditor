// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().skip(1).any(|a| a == "--cleanup") {
        let purge = args.iter().skip(1).any(|a| a == "--purge");
        std::process::exit(clauditor_lib::run_cleanup(purge));
    }
    clauditor_lib::run();
}
