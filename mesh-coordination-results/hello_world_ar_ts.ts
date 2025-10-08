// Hello World in TypeScript with Arabic greeting
// Coordinator: coordinator-5
// Sub-agent: coordinator-5-subagent-9

interface Greeting {
    text: string;
    language: string;
    combination: string;
}

const greeting: Greeting = {
    text: "مرحبا بالعالم!",
    language: "TypeScript",
    combination: "Arabic + TypeScript"
};

console.log(greeting.text);
console.log(`Hello World from ${greeting.language}!`);
console.log(`Language combination: ${greeting.combination}`);
