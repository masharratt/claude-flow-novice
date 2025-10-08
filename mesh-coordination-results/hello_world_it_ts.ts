// Hello World in TypeScript with Italian greeting
// Coordinator: coordinator-5
// Sub-agent: coordinator-5-subagent-4

interface Greeting {
    text: string;
    language: string;
    combination: string;
}

const greeting: Greeting = {
    text: "Ciao Mondo!",
    language: "TypeScript",
    combination: "Italian + TypeScript"
};

console.log(greeting.text);
console.log(`Hello World from ${greeting.language}!`);
console.log(`Language combination: ${greeting.combination}`);
