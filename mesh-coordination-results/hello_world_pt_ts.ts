// Hello World in TypeScript with Portuguese greeting
// Coordinator: coordinator-5
// Sub-agent: coordinator-5-subagent-5

interface Greeting {
    text: string;
    language: string;
    combination: string;
}

const greeting: Greeting = {
    text: "Olá Mundo!",
    language: "TypeScript",
    combination: "Portuguese + TypeScript"
};

console.log(greeting.text);
console.log(`Hello World from ${greeting.language}!`);
console.log(`Language combination: ${greeting.combination}`);
