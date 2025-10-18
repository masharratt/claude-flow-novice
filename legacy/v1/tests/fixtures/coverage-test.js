
function calculate(op, a, b) {
    switch(op) {
        case 'add': return a + b;
        case 'subtract': return a - b;
        default: return 0;
    }
}
module.exports = calculate;
