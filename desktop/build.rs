fn main() {
    println!("cargo:rerun-if-changed=commands.json");
    println!("cargo:rerun-if-changed=starter-sounds.json");
    tauri_build::build()
}
