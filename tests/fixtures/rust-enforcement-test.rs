// Test file for Rust quality enforcement
use std::fs::File;

fn dangerous_function() {
    let file = File::open("test.txt").unwrap(); // Should be detected
    println!("File opened: {:?}", file);
}

fn slightly_better() {
    let result = File::open("test.txt").expect("Failed to open file"); // Should be detected
    println!("Result: {:?}", result);
}

fn panic_example() {
    if true {
        panic!("Something went wrong"); // Should be detected
    }
}

fn incomplete_work() {
    // This function is not done yet
    todo!(); // Should be detected
}

fn not_implemented_yet() {
    unimplemented!(); // Should be detected
}

// Good example with proper error handling
fn proper_error_handling() -> Result<File, std::io::Error> {
    let file = File::open("test.txt")?;
    Ok(file)
}

// Comment with unwrap should not be detected: file.unwrap()
fn commented_unwrap() {
    // let x = file.unwrap(); // This is a comment, should be ignored
    /* also file.expect() in comments should be ignored */
}
