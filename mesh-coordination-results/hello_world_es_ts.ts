// Hello World in TypeScript with Spanish greeting
// Coordinator: coordinator-5
// Sub-agent: coordinator-5-subagent-1

interface Greeting {
    text: string;
    language: string;
    combination: string;
}

const greeting: Greeting = {
    text: "¡Hola Mundo!",
    language: "TypeScript",
    combination: "Spanish + TypeScript"
};

console.log(greeting.text);
console.log(`Hello World from ${greeting.language}!`);
console.log(`Language combination: ${greeting.combination}`);
