/**
 * Trigger.dev v4 Task: Hello World Agent
 *
 * Simple task that writes a hello world file.
 * Used to validate Trigger.dev task registration and execution.
 */

import { task } from "@trigger.dev/sdk/v3";
import * as fs from "fs";
import * as path from "path";

/**
 * Single Hello World Task
 *
 * Creates a hello world file in the specified language and format.
 */
export const helloWorldTask = task({
  id: "hello-world",
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: {
    outputDir: string;
    language: string;
    greeting: string;
    progLang: string;
    extension: string;
    agentType: string;
  }) => {
    const { outputDir, language, greeting, progLang, extension, agentType } = payload;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate filename
    const filename = `${language}-${progLang}-${agentType}.${extension}`;
    const filepath = path.join(outputDir, filename);

    // Generate code content based on programming language
    const content = generateCode(progLang, greeting);

    // Write file
    fs.writeFileSync(filepath, content, "utf8");

    return {
      success: true,
      file: filename,
      path: filepath,
      language,
      progLang,
      greeting,
    };
  },
});

/**
 * Generate code content for the specified programming language
 */
function generateCode(progLang: string, greeting: string): string {
  const templates: Record<string, (g: string) => string> = {
    typescript: (g) => `// Hello World in TypeScript\nconsole.log("${g}");\n`,
    python: (g) => `#!/usr/bin/env python3\n"""Hello World Program"""\n\ndef main():\n    print("${g}")\n\nif __name__ == "__main__":\n    main()\n`,
    rust: (g) => `fn main() {\n    println!("${g}");\n}\n`,
    go: (g) => `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("${g}")\n}\n`,
    java: (g) => `public class HelloWorld {\n    public static void main(String[] args) {\n        System.out.println("${g}");\n    }\n}\n`,
    csharp: (g) => `using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("${g}");\n    }\n}\n`,
    ruby: (g) => `#!/usr/bin/env ruby\n# Hello World in Ruby\nputs "${g}"\n`,
    php: (g) => `<?php\n// Hello World in PHP\necho "${g}\\n";\n`,
    swift: (g) => `// Hello World in Swift\nprint("${g}")\n`,
    kotlin: (g) => `// Hello World in Kotlin\nfun main() {\n    println("${g}")\n}\n`,
    javascript: (g) => `// Hello World in JavaScript\nconsole.log("${g}");\n`,
  };

  const template = templates[progLang] || templates.javascript;
  return template(greeting);
}
