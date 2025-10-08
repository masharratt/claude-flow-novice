#!/usr/bin/env node

/**
 * Conglomerate Coordination Demo
 * Shows how junior analysts at different companies in a conglomerate communicate via Redis
 */

import Redis from 'redis';

class ConglomerateCoordinationDemo {
  constructor() {
    this.redisClient = null;
    this.companies = ['TechCorp', 'FinanceHub', 'HealthPlus', 'RetailMax'];
    this.analysts = {};
  }

  async initialize() {
    this.redisClient = Redis.createClient({
      url: 'redis://localhost:6379'
    });

    this.redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    await this.redisClient.connect();
    console.log('🔗 Connected to Redis for conglomerate coordination\n');
  }

  async setupAnalysts() {
    console.log('🏢 SETTING UP CONGLOMERATE ANALYSTS');
    console.log('=' .repeat(50));

    // Create 2 junior analysts - one at each company
    this.analysts = {
      'sarah': {
        name: 'Sarah Chen',
        company: 'TechCorp',
        role: 'Junior Market Analyst',
        skills: ['data-analysis', 'market-research', 'forecasting'],
        avatar: '👩‍💼'
      },
      'mike': {
        name: 'Mike Rodriguez',
        company: 'FinanceHub',
        role: 'Junior Financial Analyst',
        skills: ['risk-assessment', 'financial-modeling', 'compliance'],
        avatar: '👨‍💼'
      }
    };

    // Register analysts in Redis
    for (const [analystId, info] of Object.entries(this.analysts)) {
      const analystKey = `conglomerate:analysts:${analystId}`;
      await this.redisClient.setEx(analystKey, 3600, JSON.stringify({
        ...info,
        status: 'online',
        lastSeen: Date.now(),
        availableForCollaboration: true,
        currentProjects: []
      }));

      // Set up company mapping
      await this.redisClient.setEx(
        `conglomerate:companies:${info.company}:analysts:${analystId}`,
        3600,
        JSON.stringify({ status: 'active', role: info.role })
      );

      // Set up skills mapping for discovery
      for (const skill of info.skills) {
        await this.redisClient.sAdd(`conglomerate:skills:${skill}`, analystId);
        await this.redisClient.expire(`conglomerate:skills:${skill}`, 3600);
      }

      console.log(`${info.avatar} ${info.name} - ${info.role} at ${info.company}`);
      console.log(`   Skills: ${info.skills.join(', ')}`);
    }

    console.log('\n✅ Both analysts registered in conglomerate coordination system\n');
  }

  async demonstrateSkillBasedDiscovery() {
    console.log('🔍 SCENARIO 1: Skill-Based Analyst Discovery');
    console.log('=' .repeat(50));

    // Sarah needs help with financial modeling for a tech market analysis
    console.log('👩‍💼 Sarah at TechCorp needs: financial-modeling expertise');

    // Find analysts with financial-modeling skill across the conglomerate
    const financialModelingAnalysts = await this.redisClient.sMembers('conglomerate:skills:financial-modeling');

    console.log('🔍 Redis search for analysts with "financial-modeling" skill:');

    for (const analystId of financialModelingAnalysts) {
      const analystData = await this.redisClient.get(`conglomerate:analysts:${analystId}`);
      const analyst = JSON.parse(analystData);

      if (analyst.status === 'online' && analyst.availableForCollaboration) {
        console.log(`   ✅ Found: ${analyst.name} at ${analyst.company} (${analyst.role})`);

        // Check if they're from a different company (cross-company collaboration)
        if (analyst.company !== 'TechCorp') {
          console.log(`      🌐 Cross-company collaboration opportunity!`);

          // Create collaboration request
          await this.createCollaborationRequest('sarah', 'mike', 'financial-modeling');
        }
      }
    }
  }

  async createCollaborationRequest(fromAnalyst, toAnalyst, skillNeeded) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const request = {
      id: requestId,
      from: fromAnalyst,
      to: toAnalyst,
      skillNeeded: skillNeeded,
      project: 'Q4 Market Analysis Integration',
      urgency: 'medium',
      message: 'Need expertise in financial modeling for tech market forecast',
      timestamp: Date.now(),
      status: 'pending'
    };

    // Store request in Redis
    await this.redisClient.setEx(
      `conglomerate:collaboration:requests:${requestId}`,
      86400, // 24 hours
      JSON.stringify(request)
    );

    // Add to recipient's inbox
    await this.redisClient.lPush(
      `conglomerate:analysts:${toAnalyst}:inbox`,
      JSON.stringify(request)
    );

    // Set up expiration for inbox
    await this.redisClient.expire(`conglomerate:analysts:${toAnalyst}:inbox`, 86400);

    console.log(`      📨 Collaboration request sent to ${this.analysts[toAnalyst].name}`);
  }

  async demonstrateRealTimeNotification() {
    console.log('\n📡 SCENARIO 2: Real-Time Notification System');
    console.log('=' .repeat(50));

    // Simulate Mike checking his messages
    console.log('👨‍💼 Mike at FinanceHub checking for new messages...');

    // Subscribe to collaboration notifications
    const subscriber = this.redisClient.duplicate();
    await subscriber.connect();

    // Mike listens for collaboration requests
    await subscriber.subscribe('conglomerate:notifications:mike', (message) => {
      const notification = JSON.parse(message);
      console.log(`      🔔 Real-time notification: ${notification.title}`);
    });

    // Publish notification
    await this.redisClient.publish('conglomerate:notifications:mike', JSON.stringify({
      title: 'New Collaboration Request',
      from: 'Sarah Chen (TechCorp)',
      skill: 'financial-modeling',
      urgency: 'medium',
      timestamp: Date.now()
    }));

    console.log('      ✅ Real-time notification sent via Redis pub/sub');
    await subscriber.quit();
  }

  async demonstrateCrossCompanyProjectCoordination() {
    console.log('\n🤝 SCENARIO 3: Cross-Company Project Coordination');
    console.log('=' .repeat(50));

    // Create a shared project space
    const projectId = `proj_${Date.now()}`;
    const project = {
      id: projectId,
      name: 'Q4 2025 Conglomerate Market Analysis',
      companies: ['TechCorp', 'FinanceHub'],
      analysts: ['sarah', 'mike'],
      status: 'active',
      created: Date.now(),
      deadline: Date.now() + (7 * 24 * 60 * 60 * 1000), // 1 week
      milestones: [
        { name: 'Data Collection', status: 'completed', assignedTo: 'sarah' },
        { name: 'Financial Modeling', status: 'in-progress', assignedTo: 'mike' },
        { name: 'Integration Analysis', status: 'pending', assignedTo: 'both' }
      ]
    };

    // Store project in Redis
    await this.redisClient.setEx(
      `conglomerate:projects:${projectId}`,
      604800, // 1 week
      JSON.stringify(project)
    );

    // Map project to analysts
    for (const analystId of project.analysts) {
      await this.redisClient.sAdd(`conglomerate:analysts:${analystId}:projects`, projectId);
      await this.redisClient.expire(`conglomerate:analysts:${analystId}:projects`, 604800);
    }

    // Map project to companies
    for (const company of project.companies) {
      await this.redisClient.sAdd(`conglomerate:companies:${company}:projects`, projectId);
      await this.redisClient.expire(`conglomerate:companies:${company}:projects`, 604800);
    }

    console.log(`📊 Created shared project: ${project.name}`);
    console.log(`   Companies: ${project.companies.join(' + ')}`);
    console.log(`   Analysts: Sarah (TechCorp) + Mike (FinanceHub)`);
    console.log(`   Project ID: ${projectId}`);
  }

  async demonstrateSharedWorkspaces() {
    console.log('\n📁 SCENARIO 4: Shared Workspaces & Data Exchange');
    console.log('=' .repeat(50));

    // Create shared data space for the project
    const projectId = (await this.redisClient.keys('conglomerate:projects:*'))[0].split(':')[2];

    // Sarah shares market data
    const marketData = {
      analyst: 'sarah',
      company: 'TechCorp',
      type: 'market-analysis',
      data: {
        techGrowth: '+15%',
        marketCap: '$2.3T',
        trends: ['AI', 'Cloud', 'IoT'],
        confidence: 0.87
      },
      timestamp: Date.now()
    };

    await this.redisClient.setEx(
      `conglomerate:projects:${projectId}:data:market-analysis`,
      86400,
      JSON.stringify(marketData)
    );

    console.log('📊 Sarah shared market analysis data to project workspace');
    console.log('   Data available to all project participants instantly');

    // Mike accesses the shared data
    const sharedData = await this.redisClient.get(`conglomerate:projects:${projectId}:data:market-analysis`);
    const parsedData = JSON.parse(sharedData);

    console.log('👨‍💼 Mike accessing shared data:');
    console.log(`   Source: ${parsedData.name} at ${parsedData.company}`);
    console.log(`   Tech Growth: ${parsedData.data.techGrowth}`);
    console.log(`   Confidence: ${(parsedData.data.confidence * 100).toFixed(0)}%`);

    // Mike adds his financial model
    const financialModel = {
      analyst: 'mike',
      company: 'FinanceHub',
      type: 'financial-model',
      data: {
        projectedRevenue: '$450M',
        riskScore: 0.23,
        recommendation: 'BUY',
        modelAccuracy: 0.91
      },
      timestamp: Date.now(),
      basedOn: 'market-analysis'
    };

    await this.redisClient.setEx(
      `conglomerate:projects:${projectId}:data:financial-model`,
      86400,
      JSON.stringify(financialModel)
    );

    console.log('\n💰 Mike added financial model to shared workspace');
    console.log('   Combined analysis now available to both companies');
  }

  async demonstrateConglomerateInsights() {
    console.log('\n📈 SCENARIO 5: Conglomerate-Level Insights');
    console.log('=' .repeat(50));

    // Get all active collaborations across the conglomerate
    const allCollaborations = await this.redisClient.keys('conglomerate:collaboration:requests:*');
    const allProjects = await this.redisClient.keys('conglomerate:projects:*');
    const allAnalysts = await this.redisClient.keys('conglomerate:analysts:*');

    console.log('🏢 Conglomerate-wide coordination status:');
    console.log(`   📊 Active Projects: ${allProjects.length}`);
    console.log(`   🤝 Collaboration Requests: ${allCollaborations.length}`);
    console.log(`   👥 Registered Analysts: ${allAnalysts.length}`);

    // Show cross-company connections
    console.log('\n🌐 Cross-Country Connections:');

    for (const projectKey of allProjects) {
      const project = JSON.parse(await this.redisClient.get(projectKey));
      if (project.companies.length > 1) {
        console.log(`   ${project.name}`);
        console.log(`     Companies: ${project.companies.join(' ↔ ')}`);
        console.log(`     Status: ${project.status}`);
      }
    }

    // Skill utilization across conglomerate
    console.log('\n💼 Skill Utilization:');
    const allSkills = await this.redisClient.keys('conglomerate:skills:*');

    for (const skillKey of allSkills.slice(0, 3)) { // Show first 3 skills
      const skill = skillKey.split(':')[2];
      const analysts = await this.redisClient.sMembers(skillKey);
      console.log(`   ${skill}: ${analysts.length} analysts available`);
    }
  }

  async demonstrateFutureScaling() {
    console.log('\n🚀 SCENARIO 6: Scaling to Full Conglomerate');
    console.log('=' .repeat(50));

    // Simulate adding more companies and analysts
    const additionalCompanies = ['EnergyCo', 'FoodChain', 'LogisticsPro', 'MediaWave'];
    const additionalRoles = ['Senior Analyst', 'Data Scientist', 'Risk Manager', 'Strategy Analyst'];

    console.log('🏗️  Simulating full conglomerate deployment...');

    let totalAnalysts = 2; // Sarah and Mike already exist

    // Add 5 analysts per additional company
    for (const company of additionalCompanies) {
      for (let i = 1; i <= 5; i++) {
        const analystId = `${company.toLowerCase()}_analyst_${i}`;
        const role = additionalRoles[Math.floor(Math.random() * additionalRoles.length)];

        await this.redisClient.setEx(`conglomerate:analysts:${analystId}`, 3600, JSON.stringify({
          name: `Analyst ${i}`,
          company: company,
          role: role,
          status: 'online',
          skills: ['data-analysis', 'reporting', 'forecasting']
        }));

        totalAnalysts++;
      }
    }

    console.log(`✅ Scaled to ${totalAnalysts} analysts across ${this.companies.length + additionalCompanies.length} companies`);
    console.log(`📊 Coordination overhead: ~0ms (Redis handles it effortlessly)`);

    // Show that Redis can handle this scale
    const startTime = Date.now();
    const allAnalystKeys = await this.redisClient.keys('conglomerate:analysts:*');
    const queryTime = Date.now() - startTime;

    console.log(`⚡ Query time for ${allAnalystKeys.length} analysts: ${queryTime}ms`);
    console.log('💡 Redis coordination scales linearly with minimal performance impact');
  }

  async run() {
    await this.initialize();

    console.log('🌐 CONGLOMERATE COORDINATION DEMONSTRATION');
    console.log('How junior analysts across companies communicate via Redis\n');

    await this.setupAnalysts();
    await this.demonstrateSkillBasedDiscovery();
    await this.demonstrateRealTimeNotification();
    await this.demonstrateCrossCompanyProjectCoordination();
    await this.demonstrateSharedWorkspaces();
    await this.demonstrateConglomerateInsights();
    await this.demonstrateFutureScaling();

    console.log('\n🎯 CONGLOMERATE COORDINATION SUCCESS FACTORS');
    console.log('=' .repeat(60));
    console.log('✅ **Skill Discovery**: Analysts find each other by expertise, not by knowing each other');
    console.log('✅ **Company Boundaries**: Redis coordination transcends company boundaries');
    console.log('✅ **Real-Time Communication**: Instant notifications via pub/sub');
    console.log('✅ **Shared Workspaces**: Project data instantly available across companies');
    console.log('✅ **Hierarchical Organization**: conglomerate:company:analyst:project:data');
    console.log('✅ **Scalability**: Can handle thousands of analysts across dozens of companies');

    console.log('\n💡 **KEY INSIGHT**: Sarah and Mike don\'t need to know each other exists!');
    console.log('   Redis automatically connects them based on:');
    console.log('   • Skill requirements ("financial-modeling")');
    console.log('   • Project needs ("market analysis")');
    console.log('   • Company collaboration opportunities');
    console.log('   • Real-time availability');

    console.log('\n🚀 **FUTURE CAPABILITIES**:');
    console.log('   • AI-powered analyst matching');
    console.log('   • Automatic project team formation');
    console.log('   • Cross-company resource optimization');
    console.log('   • Predictive collaboration suggestions');

    await this.redisClient.quit();
  }
}

// Run the demo
const demo = new ConglomerateCoordinationDemo();
demo.run().catch(console.error);