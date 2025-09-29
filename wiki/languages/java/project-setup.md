# Java Project Setup with Maven and Gradle

This guide covers comprehensive Java project setup using both Maven and Gradle build tools, with Claude Flow integration for enhanced development workflows.

## Quick Start

### Maven Project Setup

```bash
# Create new Maven project
mvn archetype:generate -DgroupId=com.example -DartifactId=my-app -DarchetypeArtifactId=maven-archetype-quickstart -DinteractiveMode=false

# With Claude Flow coordination
npx claude-flow-novice sparc run architect "Create Maven project structure with Spring Boot"
```

### Gradle Project Setup

```bash
# Create new Gradle project
gradle init --type java-application

# With Claude Flow coordination
npx claude-flow-novice sparc run architect "Create Gradle project with multi-module structure"
```

## Maven Configuration

### Basic pom.xml Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    
    <groupId>com.example</groupId>
    <artifactId>java-enterprise-app</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <packaging>jar</packaging>
    
    <name>Java Enterprise Application</name>
    <description>Enterprise Java application with Spring Boot</description>
    
    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <spring.boot.version>3.1.5</spring.boot.version>
        <junit.version>5.10.0</junit.version>
    </properties>
    
    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-dependencies</artifactId>
                <version>${spring.boot.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>
    
    <dependencies>
        <!-- Spring Boot Starters -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        
        <!-- Database -->
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
            <scope>test</scope>
        </dependency>
        
        <!-- Testing -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>${junit.version}</version>
            <scope>test</scope>
        </dependency>
    </dependencies>
    
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <version>${spring.boot.version}</version>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.0.0</version>
            </plugin>
            <plugin>
                <groupId>org.jacoco</groupId>
                <artifactId>jacoco-maven-plugin</artifactId>
                <version>0.8.10</version>
                <executions>
                    <execution>
                        <goals>
                            <goal>prepare-agent</goal>
                        </goals>
                    </execution>
                    <execution>
                        <id>report</id>
                        <phase>test</phase>
                        <goals>
                            <goal>report</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
```

### Multi-Module Maven Structure

```xml
<!-- Parent pom.xml -->
<modules>
    <module>core</module>
    <module>web</module>
    <module>data</module>
    <module>security</module>
    <module>integration</module>
</modules>
```

## Gradle Configuration

### Basic build.gradle Structure

```gradle
plugins {
    id 'java'
    id 'org.springframework.boot' version '3.1.5'
    id 'io.spring.dependency-management' version '1.1.3'
    id 'jacoco'
    id 'checkstyle'
}

group = 'com.example'
version = '1.0.0-SNAPSHOT'
java.sourceCompatibility = JavaVersion.VERSION_17

configurations {
    compileOnly {
        extendsFrom annotationProcessor
    }
}

repositories {
    mavenCentral()
}

dependencies {
    // Spring Boot Starters
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-starter-security'
    implementation 'org.springframework.boot:spring-boot-starter-validation'
    implementation 'org.springframework.boot:spring-boot-starter-actuator'
    
    // Database
    runtimeOnly 'org.postgresql:postgresql'
    testImplementation 'com.h2database:h2'
    
    // Development Tools
    developmentOnly 'org.springframework.boot:spring-boot-devtools'
    annotationProcessor 'org.springframework.boot:spring-boot-configuration-processor'
    
    // Testing
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testImplementation 'org.springframework.security:spring-security-test'
    testImplementation 'org.testcontainers:junit-jupiter'
    testImplementation 'org.testcontainers:postgresql'
}

tasks.named('test') {
    useJUnitPlatform()
    finalizedBy jacocoTestReport
}

jacocoTestReport {
    dependsOn test
    reports {
        xml.required = true
        csv.required = false
        html.outputLocation = layout.buildDirectory.dir('jacocoHtml')
    }
}

checkstyle {
    toolVersion = '10.12.4'
    configFile = file('config/checkstyle/checkstyle.xml')
}
```

### Multi-Project Gradle Structure

```gradle
// settings.gradle
rootProject.name = 'java-enterprise-app'
include 'core', 'web', 'data', 'security', 'integration'

// build.gradle (root)
subprojects {
    apply plugin: 'java'
    apply plugin: 'org.springframework.boot'
    apply plugin: 'io.spring.dependency-management'
    
    java.sourceCompatibility = JavaVersion.VERSION_17
    
    repositories {
        mavenCentral()
    }
}
```

## Claude Flow Integration

### Project Generation with Agents

```bash
# Initialize project with multiple agents
npx claude-flow-novice sparc batch architect,coder,tester "Create enterprise Java project with Maven"

# Generate project structure
npx claude-flow-novice sparc run architect "Design multi-module Java project structure"

# Setup build configuration
npx claude-flow-novice sparc run coder "Configure Maven/Gradle with enterprise plugins"

# Generate tests
npx claude-flow-novice sparc run tester "Create comprehensive test structure"
```

### MCP Integration for Project Setup

```bash
# Initialize swarm for Java development
npx claude-flow-novice mcp swarm_init --topology hierarchical --max-agents 8

# Spawn specialized agents
npx claude-flow-novice mcp agent_spawn --type architect --capabilities "project-structure,build-tools"
npx claude-flow-novice mcp agent_spawn --type coder --capabilities "maven,gradle,spring-boot"
npx claude-flow-novice mcp agent_spawn --type tester --capabilities "junit,testng,integration-tests"
```

## Directory Structure

### Maven Project Structure

```
java-enterprise-app/
├── pom.xml
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── com/example/app/
│   │   │       ├── Application.java
│   │   │       ├── config/
│   │   │       ├── controller/
│   │   │       ├── service/
│   │   │       ├── repository/
│   │   │       └── model/
│   │   └── resources/
│   │       ├── application.yml
│   │       ├── application-dev.yml
│   │       ├── application-prod.yml
│   │       └── static/
│   └── test/
│       ├── java/
│       │   └── com/example/app/
│       │       ├── integration/
│       │       ├── unit/
│       │       └── TestApplication.java
│       └── resources/
│           └── application-test.yml
├── target/
└── README.md
```

### Gradle Project Structure

```
java-enterprise-app/
├── build.gradle
├── settings.gradle
├── gradle/
│   └── wrapper/
├── src/
│   ├── main/
│   │   ├── java/
│   │   └── resources/
│   └── test/
│       ├── java/
│       └── resources/
├── build/
├── config/
│   ├── checkstyle/
│   └── spotbugs/
└── README.md
```

## Best Practices

### 1. Version Management

```xml
<!-- Use properties for version management -->
<properties>
    <java.version>17</java.version>
    <spring.boot.version>3.1.5</spring.boot.version>
    <maven.compiler.source>${java.version}</maven.compiler.source>
    <maven.compiler.target>${java.version}</maven.compiler.target>
</properties>
```

### 2. Profile Configuration

```xml
<!-- Maven profiles for different environments -->
<profiles>
    <profile>
        <id>dev</id>
        <activation>
            <activeByDefault>true</activeByDefault>
        </activation>
        <properties>
            <spring.profiles.active>dev</spring.profiles.active>
        </properties>
    </profile>
    <profile>
        <id>prod</id>
        <properties>
            <spring.profiles.active>prod</spring.profiles.active>
        </properties>
    </profile>
</profiles>
```

### 3. Code Quality Integration

```gradle
// Gradle code quality plugins
plugins {
    id 'checkstyle'
    id 'pmd'
    id 'spotbugs' version '5.0.14'
    id 'jacoco'
}

checkstyle {
    toolVersion = '10.12.4'
    maxWarnings = 0
}

pmd {
    toolVersion = '6.55.0'
    ruleSetFiles = files('config/pmd/pmd-rules.xml')
}

spotbugs {
    toolVersion = '4.7.3'
    effort = 'max'
    reportLevel = 'low'
}
```

## IDE Integration

### IntelliJ IDEA Configuration

```xml
<!-- .idea/compiler.xml -->
<component name="CompilerConfiguration">
    <annotationProcessing>
        <profile default="true" name="Default" enabled="true" />
    </annotationProcessing>
</component>
```

### VS Code Configuration

```json
{
    "java.configuration.updateBuildConfiguration": "automatic",
    "java.test.defaultConfig": "default",
    "java.format.settings.url": "config/checkstyle/checkstyle.xml"
}
```

## Common Commands

### Maven Commands

```bash
# Clean and compile
mvn clean compile

# Run tests
mvn test

# Package application
mvn package

# Run Spring Boot application
mvn spring-boot:run

# Generate site documentation
mvn site

# Deploy to repository
mvn deploy
```

### Gradle Commands

```bash
# Clean and build
./gradlew clean build

# Run tests
./gradlew test

# Run application
./gradlew bootRun

# Generate test report
./gradlew jacocoTestReport

# Check code quality
./gradlew check
```

## Troubleshooting

### Common Issues

1. **Dependency Conflicts**
   ```bash
   # Maven dependency tree
   mvn dependency:tree
   
   # Gradle dependencies
   ./gradlew dependencies
   ```

2. **Memory Issues**
   ```bash
   # Set JVM options
   export MAVEN_OPTS="-Xmx2g -XX:MaxPermSize=256m"
   export GRADLE_OPTS="-Xmx2g -XX:MaxMetaspaceSize=256m"
   ```

3. **Build Cache Issues**
   ```bash
   # Clear Maven cache
   rm -rf ~/.m2/repository
   
   # Clear Gradle cache
   ./gradlew clean --refresh-dependencies
   ```

## Next Steps

- [Spring Boot Development](spring-boot.md)
- [Enterprise Java Development](enterprise-java.md)
- [Testing Strategies](testing.md)
- [Performance Optimization](performance.md)
- [Microservices Development](microservices.md)
