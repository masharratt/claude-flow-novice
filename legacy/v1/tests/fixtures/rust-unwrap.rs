fn main() {
    let result = Some(42);
    let value = result.unwrap(); // Line 4
    let another = result.unwrap(); // Line 5
    println!("{}", value);
}
