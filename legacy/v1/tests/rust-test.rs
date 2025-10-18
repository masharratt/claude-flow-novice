// Test Rust file for hook validation
fn add_numbers(a: i32, b: i32) -> i32 {
    a + b
}

fn divide_numbers(a: f64, b: f64) -> Result<f64, String> {
    if b == 0.0 {
        Err("Cannot divide by zero".to_string())
    } else {
        Ok(a / b)
    }
}

// Function with potential improvement areas
fn inefficient_function() {
    let mut vec = Vec::new();
    for i in 0..1000 {
        vec.push(i.clone()); // Unnecessary clone
    }
    vec.clone() // Another unnecessary clone
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_numbers() {
        assert_eq!(add_numbers(2, 3), 5);
    }

    #[test]
    fn test_divide_numbers() {
        assert_eq!(divide_numbers(10.0, 2.0), Ok(5.0));
        assert!(divide_numbers(10.0, 0.0).is_err());
    }
}