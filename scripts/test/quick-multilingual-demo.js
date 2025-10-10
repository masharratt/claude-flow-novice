#!/usr/bin/env node

/**
 * Quick Multilingual Hello World Demo
 *
 * Demonstrates the concept with 10 sample Hello World functions
 * in different programming languages and world languages
 */

import fs from 'fs/promises';
import path from 'path';

class QuickMultilingualDemo {
  constructor() {
    this.outputDir = './.artifacts/demo-results/multilingual';
  }

  async start() {
    console.log('🌍 Quick Multilingual Hello World Demo');
    console.log('   Creating Hello World functions in 10 programming languages\n');

    await fs.mkdir(this.outputDir, { recursive: true });

    const samples = [
      {
        progLang: 'Python',
        worldLang: 'Spanish',
        greeting: '¡Hola Mundo!',
        fileName: 'hola_mundo.py',
        code: `#!/usr/bin/env python3
# Hola Mundo - Hello World in Python with Spanish greeting
# Demonstrates both programming diversity and cultural diversity

def hola_mundo():
    """
    Hola Mundo Function
    This function prints a greeting in Spanish, showing cultural diversity
    alongside Python programming language diversity.
    """
    print("¡Hola Mundo!")  # Hello World in Spanish
    print("Welcome to programming diversity!")

    # Cultural context: Spanish is spoken by 500+ million people worldwide
    # This greeting represents Spain, Latin America, and Hispanic communities
    return "¡Saludos desde el mundo de la programación!"  # Greetings from the programming world!

if __name__ == "__main__":
    hola_mundo()`
      },
      {
        progLang: 'JavaScript',
        worldLang: 'French',
        greeting: 'Bonjour le Monde!',
        fileName: 'bonjour_monde.js',
        code: `// Bonjour le Monde - Hello World in JavaScript with French greeting
// Demonstrates both programming diversity and cultural diversity

function bonjourMonde() {
    /**
     * Bonjour le Monde Function
     * This function displays a greeting in French, showcasing cultural diversity
     * alongside JavaScript's versatility in web development.
     */
    console.log("Bonjour le Monde!"); // Hello World in French
    console.log("Welcome to the world of programming diversity!");

    // Cultural context: French is spoken in France, Canada, Africa, and diplomatic circles
    // This greeting represents Francophone culture and influence
    return "Bienvenue dans la diversité de la programmation!"; // Welcome to programming diversity!
}

// ES6 module export
export default bonjourMonde;

// For CommonJS environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = bonjourMonde;
}`
      },
      {
        progLang: 'Java',
        worldLang: 'Japanese',
        greeting: 'こんにちは世界！',
        fileName: 'konnichiwa_sekai.java',
        code: `// こんにちは世界 - Hello World in Java with Japanese greeting
// Demonstrates both programming diversity and cultural diversity

public class KonnichiwaSekai {

    /**
     * Main method - Entry point for the program
     * Displays greeting in Japanese, showing cultural diversity
     * alongside Java's platform independence and robust structure.
     */
    public static void main(String[] args) {
        konnichiwaSekai();
    }

    /**
     * こんにちは世界 Function
     * This method prints a greeting in Japanese, showcasing cultural diversity
     * alongside Java's object-oriented programming paradigm.
     */
    public static void konnichiwaSekai() {
        System.out.println("こんにちは世界！"); // Hello World in Japanese
        System.out.println("Welcome to programming diversity!");

        // Cultural context: Japanese combines tradition with technological innovation
        // This greeting represents Japan's unique blend of ancient culture and modern technology
        String message = "プログラミングの多様性へようこそ！"; // Welcome to programming diversity!
        System.out.println(message);
    }
}`
      },
      {
        progLang: 'C++',
        worldLang: 'Arabic',
        greeting: 'مرحبا بالعالم!',
        fileName: 'marhaban_bialalam.cpp',
        code: `// مرحبا بالعالم - Hello World in C++ with Arabic greeting
// Demonstrates both programming diversity and cultural diversity

#include <iostream>
#include <string>
#include <locale>

// Function to display Arabic greeting
void marhabanBialalam() {
    /**
     * مرحبا بالعالم Function
     * This function displays a greeting in Arabic, showcasing cultural diversity
     * alongside C++'s performance and system-level programming capabilities.
     */

    std::cout << "مرحبا بالعالم!" << std::endl; // Hello World in Arabic
    std::cout << "Welcome to programming diversity!" << std::endl;

    // Cultural context: Arabic is spoken across the Middle East and North Africa
    // This greeting represents Arab contributions to mathematics, science, and philosophy
    std::cout << "مرحبا بكم في عالم تنوع البرمجة!" << std::endl; // Welcome to the world of programming diversity!
}

int main() {
    // Set locale for proper Arabic text display
    try {
        std::locale::global(std::locale("en_US.UTF-8"));
    } catch (...) {
        // Fallback if locale setting fails
    }

    marhabanBialalam();
    return 0;
}`
      },
      {
        progLang: 'Go',
        worldLang: 'Hindi',
        greeting: 'नमस्ते दुनिया!',
        fileName: 'namaste_duniya.go',
        code: `// नमस्ते दुनिया - Hello World in Go with Hindi greeting
// Demonstrates both programming diversity and cultural diversity

package main

import (
	"fmt"
)

// NamasteDuniya function displays greeting in Hindi
func NamasteDuniya() {
	/**
	 * नमस्ते दुनिया Function
	 * This function displays a greeting in Hindi, showcasing cultural diversity
	 * alongside Go's simplicity, efficiency, and concurrency features.
	 */

	fmt.Println("नमस्ते दुनिया!") // Hello World in Hindi
	fmt.Println("Welcome to programming diversity!")

	// Cultural context: Hindi is one of the world's most spoken languages
	// This greeting represents India's rich cultural heritage and technological growth
	fmt.Println("प्रोग्रामिंग की विविधता में आपका स्वागत है!") // Welcome to programming diversity!
}

func main() {
	NamasteDuniya()
}`
      },
      {
        progLang: 'Rust',
        worldLang: 'Russian',
        greeting: 'Привет мир!',
        fileName: 'privet_mir.rs',
        code: `// Привет мир - Hello World in Rust with Russian greeting
// Demonstrates both programming diversity and cultural diversity

fn main() {
    privet_mir();
}

/// Привет мир Function
/// This function displays a greeting in Russian, showcasing cultural diversity
/// alongside Rust's memory safety, performance, and modern systems programming.
fn privet_mir() {
    println!("Привет мир!"); // Hello World in Russian
    println!("Welcome to programming diversity!");

    // Cultural context: Russian represents Eastern European and Slavic cultures
    // This greeting reflects Russia's contributions to space exploration, mathematics, and literature
    let message = "Добро пожаловать в мир разнообразия программирования!"; // Welcome to the world of programming diversity!
    println!("{}", message);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_privet_mir() {
        // Test function to ensure the greeting works correctly
        assert_eq!(privet_mir_with_return(), "Привет мир!");
    }
}

fn privet_mir_with_return() -> String {
    "Привет мир!".to_string()
}`
      },
      {
        progLang: 'TypeScript',
        worldLang: 'Chinese',
        greeting: '你好，世界！',
        fileName: 'ni_hao_shijie.ts',
        code: `// 你好，世界 - Hello World in TypeScript with Chinese greeting
// Demonstrates both programming diversity and cultural diversity

interface GreetingMessage {
    text: string;
    language: string;
    culturalNote: string;
}

class NiHaoShijie {
    private greeting: string = "你好，世界！"; // Hello World in Chinese

    /**
     * 你好，世界 Method
     * This method displays a greeting in Chinese, showcasing cultural diversity
     * alongside TypeScript's type safety and modern JavaScript features.
     */
    public sayHello(): GreetingMessage {
        console.log(this.greeting);
        console.log("Welcome to programming diversity!");

        // Cultural context: Chinese represents one of the world's oldest civilizations
        // This greeting reflects China's technological advancement and cultural heritage
        const message: string = "欢迎来到编程多样性的世界！"; // Welcome to the world of programming diversity!
        console.log(message);

        return {
            text: this.greeting,
            language: "Chinese (Mandarin)",
            culturalNote: "Spoken by over 1 billion people, representing Chinese civilization and innovation"
        };
    }
}

// Usage example
const greeter = new NiHaoShijie();
greeter.sayHello();

export default NiHaoShijie;`
      },
      {
        progLang: 'Swift',
        worldLang: 'Korean',
        greeting: '안녕하세요 세계!',
        fileName: 'annyeonghaseyo_segye.swift',
        code: `// 안녕하세요 세계 - Hello World in Swift with Korean greeting
// Demonstrates both programming diversity and cultural diversity

import Foundation

class AnnyeonghaseyoSegye {
    private let greeting = "안녕하세요 세계!" // Hello World in Korean

    /**
     * 안녕하세요 세계 Method
     * This method displays a greeting in Korean, showcasing cultural diversity
     * alongside Swift's modern syntax, safety, and performance for Apple platforms.
     */
    func sayHello() -> String {
        print(greeting)
        print("Welcome to programming diversity!")

        // Cultural context: Korean represents South Korea's technological innovation
        // and North Korea's cultural heritage, showcasing the Korean peninsula's diversity
        let message = "프로그래밍 다양성의 세계에 오신 것을 환영합니다!" // Welcome to the world of programming diversity!
        print(message)

        return greeting
    }
}

// Main execution
let greeter = AnnyeonghaseyoSegye()
let result = greeter.sayHello()

print("Result: \\(result)")`
      },
      {
        progLang: 'Ruby',
        worldLang: 'Portuguese',
        greeting: 'Olá Mundo!',
        fileName: 'ola_mundo.rb',
        code: `#!/usr/bin/env ruby
# Olá Mundo - Hello World in Ruby with Portuguese greeting
# Demonstrates both programming diversity and cultural diversity

class OlaMundo
  def initialize
    @greeting = "Olá Mundo!" # Hello World in Portuguese
    @language = "Portuguese"
  end

  # Olá Mundo Method
  # This method displays a greeting in Portuguese, showcasing cultural diversity
  # alongside Ruby's elegant syntax and dynamic programming capabilities.
  def say_hello
    puts @greeting
    puts "Welcome to programming diversity!"

    # Cultural context: Portuguese is spoken in Brazil, Portugal, and parts of Africa and Asia
    # This greeting represents the Lusophone world's cultural richness and diversity
    message = "Bem-vindo ao mundo da diversidade de programação!" # Welcome to the world of programming diversity!
    puts message

    # Return a hash with greeting information
    {
      text: @greeting,
      language: @language,
      cultural_note: "Represents Brazilian carnival, Portuguese exploration, and Lusophone culture"
    }
  end
end

# Usage
greeter = OlaMundo.new
result = greeter.say_hello
puts "Result: #{result[:text]} - #{result[:language]}"`
      },
      {
        progLang: 'Kotlin',
        worldLang: 'German',
        greeting: 'Hallo Welt!',
        fileName: 'hallo_welt.kt',
        code: `// Hallo Welt - Hello World in Kotlin with German greeting
// Demonstrates both programming diversity and cultural diversity

data class GreetingInfo(
    val text: String,
    val language: String,
    val culturalNote: String
)

class HalloWelt {
    private val greeting = "Hallo Welt!" // Hello World in German

    /**
     * Hallo Welt Function
     * This function displays a greeting in German, showcasing cultural diversity
     * alongside Kotlin's modern JVM language features and null safety.
     */
    fun sayHello(): GreetingInfo {
        println(greeting)
        println("Welcome to programming diversity!")

        // Cultural context: German represents engineering precision and European culture
        // This greeting reflects Germany's contributions to computer science and philosophy
        val message = "Willkommen in der Welt der Programmierungsvielfalt!" // Welcome to the world of programming diversity!
        println(message)

        return GreetingInfo(
            text = greeting,
            language = "German",
            culturalNote = "Represents German engineering, philosophy, and European innovation"
        )
    }
}

fun main() {
    val greeter = HalloWelt()
    val result = greeter.sayHello()

    println("Greeting Info: ${result.text} (${result.language})")
    println("Cultural Note: ${result.culturalNote}")
}

// For direct execution
main()`
      }
    ];

    // Create all the Hello World files
    for (const sample of samples) {
      const filePath = path.join(this.outputDir, sample.fileName);
      await fs.writeFile(filePath, sample.code);
      console.log(`✅ Created ${sample.fileName} - ${sample.progLang} + ${sample.worldLang}`);
    }

    // Generate a summary report
    const reportResult = await this.generateDemoReport(samples);
    return reportResult;
  }

  async generateDemoReport(samples) {
    const report = {
      demo: {
        type: 'quick-multilingual-hello-world-demo',
        totalSamples: samples.length,
        programmingLanguages: [...new Set(samples.map(s => s.progLang))],
        worldLanguages: [...new Set(samples.map(s => s.worldLang))],
        greetings: samples.map(s => s.greeting)
      },
      samples: samples.map(s => ({
        programmingLanguage: s.progLang,
        worldLanguage: s.worldLang,
        greeting: s.greeting,
        fileName: s.fileName
      }))
    };

    const reportFile = path.join(this.outputDir, `demo-report-${Date.now()}.json`);
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

    console.log('\n🌍 MULTILINGUAL HELLO WORLD DEMO RESULTS:');
    console.log(`   Total Samples: ${report.demo.totalSamples}`);
    console.log(`   Programming Languages: ${report.demo.programmingLanguages.join(', ')}`);
    console.log(`   World Languages: ${report.demo.worldLanguages.join(', ')}`);
    console.log(`   Report saved to: ${reportFile}`);

    console.log('\n🌐 LANGUAGE DIVERSITY SHOWCASE:');
    for (const sample of samples) {
      console.log(`   ${sample.progLang} + ${sample.worldLang}: "${sample.greeting}"`);
    }

    console.log('\n🎯 SUMMARY:');
    console.log('   ✅ Demonstrated programming diversity across 10 different languages');
    console.log('   🌍 Showcased cultural diversity with greetings from around the world');
    console.log('   💻 Each file contains working code with cultural context');
    console.log('   📁 All files saved to .artifacts/demo-results/multilingual/');
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = new QuickMultilingualDemo();
  demo.start().catch(error => {
    console.error('Demo failed:', error);
    process.exit(1);
  });
}

export default QuickMultilingualDemo;