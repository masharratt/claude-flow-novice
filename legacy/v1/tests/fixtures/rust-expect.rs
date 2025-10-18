fn main() {
    let result = Some(42);
    let value = result.expect("Should have value"); // Line 4
    println!("{}", value);
}
