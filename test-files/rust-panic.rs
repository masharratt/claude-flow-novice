fn divide(a: i32, b: i32) -> i32 {
    if b == 0 {
        panic!("Division by zero!"); // Line 4
    }
    a / b
}

fn main() {
    let result = divide(10, 2);
    panic!("Another panic"); // Line 11
}
