/**
 * Simple Project Manager for novice users
 */ import * as fs from 'fs';
export class ProjectManager {
    configFile = 'claude-flow-novice.json';
    /**
   * Initialize a new project
   */ initProject(name, description = '') {
        if (this.projectExists()) {
            throw new Error('Project already exists in this directory');
        }
        const config = {
            name,
            description,
            agents: [],
            created: new Date()
        };
        this.saveConfig(config);
        console.log(`🎉 Initialized project: ${name}`);
    }
    /**
   * Load project configuration
   */ loadProject() {
        if (!this.projectExists()) {
            throw new Error('No project found. Run "claude-flow-novice init <name>" first.');
        }
        const configData = fs.readFileSync(this.configFile, 'utf-8');
        return JSON.parse(configData);
    }
    /**
   * Save project configuration
   */ saveConfig(config) {
        fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
    }
    /**
   * Check if project exists
   */ projectExists() {
        return fs.existsSync(this.configFile);
    }
    /**
   * Get project status
   */ getStatus() {
        if (!this.projectExists()) {
            console.log('❌ No project found in current directory');
            return;
        }
        const config = this.loadProject();
        console.log(`📊 Project: ${config.name}`);
        console.log(`📝 Description: ${config.description || 'No description'}`);
        console.log(`📅 Created: ${new Date(config.created).toLocaleDateString()}`);
        console.log(`🤖 Agents: ${config.agents.length}`);
        if (config.agents.length > 0) {
            console.log('\\n🤖 Agent Summary:');
            const statusCounts = config.agents.reduce((acc, agent)=>{
                acc[agent.status] = (acc[agent.status] || 0) + 1;
                return acc;
            }, {});
            Object.entries(statusCounts).forEach(([status, count])=>{
                const emoji = this.getStatusEmoji(status);
                console.log(`  ${emoji} ${status}: ${count}`);
            });
        }
    }
    getStatusEmoji(status) {
        switch(status){
            case 'pending':
                return '⏳';
            case 'running':
                return '🔄';
            case 'completed':
                return '✅';
            case 'failed':
                return '❌';
            default:
                return '❓';
        }
    }
}

//# sourceMappingURL=project-manager.js.map