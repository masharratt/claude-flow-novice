// Hello World in TypeScript with Chinese greeting
// Coordinator: coordinator-5
// Sub-agent: coordinator-5-subagent-8

interface Greeting {
    text: string;
    language: string;
    combination: string;
}

const greeting: Greeting = {
    text: "你好，世界！",
    language: "TypeScript",
    combination: "Chinese + TypeScript"
};

console.log(greeting.text);
console.log(`Hello World from ${greeting.language}!`);
console.log(`Language combination: ${greeting.combination}`);
