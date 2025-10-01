// Test file for JavaScript quality checks
// This file contains intentional quality issues

// Security issue 1: eval() usage
function executeUserCode(userInput) {
    return eval(userInput);
}

// Security issue 2: XSS vulnerability
function updatePage(content) {
    document.body.innerHTML = '<div>' + content + '</div>';
}

// Quality issue 1: Using var
var oldStyleVariable = "should use let or const";

// Quality issue 2: Loose equality
function checkValue(value) {
    if (value == null) {
        return true;
    }
    return false;
}

// Security issue 3: Password logging
function login(username, password) {
    console.log('Login attempt:', username, password);
    return authenticateUser(username, password);
}

// Code duplication
function calculateUserDiscount(user) {
    const baseDiscount = 0.1;
    const premiumBonus = user.isPremium ? 0.05 : 0;
    const loyaltyBonus = user.yearsActive > 5 ? 0.03 : 0;
    return baseDiscount + premiumBonus + loyaltyBonus;
}

function calculateProductDiscount(product) {
    const baseDiscount = 0.1;
    const premiumBonus = product.isPremium ? 0.05 : 0;
    const loyaltyBonus = product.yearsActive > 5 ? 0.03 : 0;
    return baseDiscount + premiumBonus + loyaltyBonus;
}

function authenticateUser(username, password) {
    return true;
}
