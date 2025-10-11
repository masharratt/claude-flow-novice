fn main() {
    // This comment mentions .unwrap() but shouldn't trigger
    /* Another comment with panic!() inside */
    let value = 42;
    println!("{}", value);
}
