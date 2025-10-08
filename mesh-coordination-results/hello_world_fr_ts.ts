// Hello World in TypeScript with French greeting
// Coordinator: coordinator-5
// Sub-agent: coordinator-5-subagent-2

interface Greeting {
    text: string;
    language: string;
    combination: string;
}

const greeting: Greeting = {
    text: "Bonjour le Monde!",
    language: "TypeScript",
    combination: "French + TypeScript"
};

console.log(greeting.text);
console.log(`Hello World from ${greeting.language}!`);
console.log(`Language combination: ${greeting.combination}`);
