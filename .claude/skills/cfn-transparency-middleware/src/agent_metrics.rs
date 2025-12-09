use std::collections::HashMap;
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AgentData {
    total_time: u64,
    count: u64,
}

impl AgentData {
    fn new() -> Self {
        Self {
            total_time: 0,
            count: 0,
        }
    }

    fn add_execution_time(&mut self, time: u64) {
        self.total_time = self.total_time.saturating_add(time);
        self.count = self.count.saturating_add(1);
    }

    fn average_time(&self) -> Option<f64> {
        if self.count == 0 {
            None
        } else {
            Some(self.total_time as f64 / self.count as f64)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetrics {
    agents: HashMap<String, AgentData>,
}

impl AgentMetrics {
    pub fn new() -> Self {
        Self {
            agents: HashMap::new(),
        }
    }

    pub fn add_execution_time(&mut self, agent_name: &str, time: u64) -> Result<()> {
        let data = self.agents.entry(agent_name.to_string()).or_insert_with(AgentData::new);
        data.add_execution_time(time);
        Ok(())
    }

    pub fn get_average_time(&self, agent_name: &str) -> Result<Option<f64>> {
        Ok(self.agents.get(agent_name).and_then(|data| data.average_time()))
    }

    pub fn get_total_executions(&self, agent_name: &str) -> Result<u64> {
        Ok(self.agents.get(agent_name).map(|data| data.count).unwrap_or(0))
    }

    pub fn get_top_performers(&self, limit: usize) -> Result<Vec<(String, f64, u64)>> {
        let mut performers: Vec<(String, f64, u64)> = self
            .agents
            .iter()
            .filter_map(|(name, data)| {
                data.average_time().map(|avg| (name.clone(), avg, data.count))
            })
            .collect();

        performers.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

        performers.truncate(limit);
        Ok(performers)
    }

    pub fn calculate_performance_percentile(&self, agent_name: &str) -> Result<Option<f64>> {
        let agent_data = match self.agents.get(agent_name) {
            Some(data) => data,
            None => return Ok(None),
        };
        
        let agent_avg = match agent_data.average_time() {
            Some(avg) => avg,
            None => return Ok(None),
        };

        let mut averages: Vec<f64> = self
            .agents
            .values()
            .filter_map(|data| data.average_time())
            .collect();

        if averages.is_empty() {
            return Ok(None);
        }

        averages.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

        let total_agents = averages.len() as f64;
        let better_agents = averages
            .iter()
            .filter(|&&avg| avg < agent_avg)
            .count() as f64;

        let percentile = if better_agents == 0.0 && agent_avg == averages[0] {
            100.0
        } else if better_agents == total_agents - 1.0 && agent_avg == averages[averages.len() - 1] {
            0.0
        } else {
            ((total_agents - better_agents - 1.0) / total_agents) * 100.0
        };

        Ok(Some(percentile))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Result;

    #[test]
    fn test_new_creates_empty_metrics() {
        let metrics = AgentMetrics::new();
        assert!(metrics.get_average_time("agent1").unwrap().is_none());
        assert_eq!(metrics.get_total_executions("agent1").unwrap(), 0);
    }

    #[test]
    fn test_add_execution_time_single_agent() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        metrics.add_execution_time("agent1", 100)?;
        metrics.add_execution_time("agent1", 200)?;
        metrics.add_execution_time("agent1", 300)?;
        
        assert_eq!(metrics.get_total_executions("agent1")?, 3);
        assert_eq!(metrics.get_average_time("agent1")?, Some(200.0));
        
        Ok(())
    }

    #[test]
    fn test_add_execution_time_multiple_agents() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        metrics.add_execution_time("agent1", 100)?;
        metrics.add_execution_time("agent1", 200)?;
        metrics.add_execution_time("agent2", 50)?;
        metrics.add_execution_time("agent2", 150)?;
        
        assert_eq!(metrics.get_total_executions("agent1")?, 2);
        assert_eq!(metrics.get_total_executions("agent2")?, 2);
        assert_eq!(metrics.get_average_time("agent1")?, Some(150.0));
        assert_eq!(metrics.get_average_time("agent2")?, Some(100.0));
        
        Ok(())
    }

    #[test]
    fn test_get_average_time_unknown_agent() -> Result<()> {
        let metrics = AgentMetrics::new();
        assert!(metrics.get_average_time("unknown").unwrap().is_none());
        Ok(())
    }

    #[test]
    fn test_get_total_executions_unknown_agent() -> Result<()> {
        let metrics = AgentMetrics::new();
        assert_eq!(metrics.get_total_executions("unknown")?, 0);
        Ok(())
    }

    #[test]
    fn test_get_top_performers_empty() -> Result<()> {
        let metrics = AgentMetrics::new();
        let top = metrics.get_top_performers(5)?;
        assert!(top.is_empty());
        Ok(())
    }

    #[test]
    fn test_get_top_performers_single_agent() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        metrics.add_execution_time("agent1", 100)?;
        metrics.add_execution_time("agent1", 200)?;
        
        let top = metrics.get_top_performers(5)?;
        assert_eq!(top.len(), 1);
        assert_eq!(top[0], ("agent1".to_string(), 150.0, 2));
        
        Ok(())
    }

    #[test]
    fn test_get_top_performers_multiple_agents() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        metrics.add_execution_time("fast", 50)?;
        metrics.add_execution_time("fast", 70)?;
        metrics.add_execution_time("medium", 100)?;
        metrics.add_execution_time("medium", 120)?;
        metrics.add_execution_time("slow", 200)?;
        metrics.add_execution_time("slow", 220)?;
        
        let top = metrics.get_top_performers(3)?;
        assert_eq!(top.len(), 3);
        assert_eq!(top[0], ("fast".to_string(), 60.0, 2));
        assert_eq!(top[1], ("medium".to_string(), 110.0, 2));
        assert_eq!(top[2], ("slow".to_string(), 210.0, 2));
        
        Ok(())
    }

    #[test]
    fn test_get_top_performers_limit() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        for i in 0..10 {
            let name = format!("agent{}", i);
            metrics.add_execution_time(&name, (i + 1) * 100)?;
            metrics.add_execution_time(&name, (i + 1) * 100 + 50)?;
        }
        
        let top = metrics.get_top_performers(3)?;
        assert_eq!(top.len(), 3);
        assert_eq!(top[0].0, "agent0");
        assert_eq!(top[1].0, "agent1");
        assert_eq!(top[2].0, "agent2");
        
        Ok(())
    }

    #[test]
    fn test_get_top_performers_ties() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        metrics.add_execution_time("agent1", 100)?;
        metrics.add_execution_time("agent1", 200)?;
        metrics.add_execution_time("agent2", 100)?;
        metrics.add_execution_time("agent2", 200)?;
        metrics.add_execution_time("agent3", 300)?;
        metrics.add_execution_time("agent3", 400)?;
        
        let top = metrics.get_top_performers(5)?;
        assert_eq!(top.len(), 3);
        
        let avg1 = top[0].1;
        let avg2 = top[1].1;
        let avg3 = top[2].1;
        
        assert!(avg1 <= avg2);
        assert!(avg2 <= avg3);
        
        Ok(())
    }

    #[test]
    fn test_calculate_performance_percentile_empty() -> Result<()> {
        let metrics = AgentMetrics::new();
        assert!(metrics.calculate_performance_percentile("agent1").unwrap().is_none());
        Ok(())
    }

    #[test]
    fn test_calculate_performance_percentile_unknown_agent() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        metrics.add_execution_time("agent1", 100)?;
        assert!(metrics.calculate_performance_percentile("unknown").unwrap().is_none());
        Ok(())
    }

    #[test]
    fn test_calculate_performance_percentile_single_agent() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        metrics.add_execution_time("agent1", 100)?;
        
        let percentile = metrics.calculate_performance_percentile("agent1")?;
        assert_eq!(percentile, Some(100.0));
        
        Ok(())
    }

    #[test]
    fn test_calculate_performance_percentile_fastest() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        metrics.add_execution_time("fast", 50)?;
        metrics.add_execution_time("fast", 60)?;
        metrics.add_execution_time("medium", 100)?;
        metrics.add_execution_time("medium", 110)?;
        metrics.add_execution_time("slow", 200)?;
        metrics.add_execution_time("slow", 210)?;
        
        let percentile = metrics.calculate_performance_percentile("fast")?;
        assert_eq!(percentile, Some(100.0));
        
        Ok(())
    }

    #[test]
    fn test_calculate_performance_percentile_slowest() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        metrics.add_execution_time("fast", 50)?;
        metrics.add_execution_time("fast", 60)?;
        metrics.add_execution_time("medium", 100)?;
        metrics.add_execution_time("medium", 110)?;
        metrics.add_execution_time("slow", 200)?;
        metrics.add_execution_time("slow", 210)?;
        
        let percentile = metrics.calculate_performance_percentile("slow")?;
        assert_eq!(percentile, Some(0.0));
        
        Ok(())
    }

    #[test]
    fn test_calculate_performance_percentile_middle() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        metrics.add_execution_time("fast", 50)?;
        metrics.add_execution_time("fast", 60)?;
        metrics.add_execution_time("medium", 100)?;
        metrics.add_execution_time("medium", 110)?;
        metrics.add_execution_time("slow", 200)?;
        metrics.add_execution_time("slow", 210)?;
        
        let percentile = metrics.calculate_performance_percentile("medium")?;
        assert_eq!(percentile, Some(50.0));
        
        Ok(())
    }

    #[test]
    fn test_calculate_performance_percentile_multiple_middle() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        metrics.add_execution_time("agent1", 50)?;
        metrics.add_execution_time("agent2", 60)?;
        metrics.add_execution_time("agent3", 70)?;
        metrics.add_execution_time("agent4", 80)?;
        metrics.add_execution_time("agent5", 90)?;
        
        let percentile = metrics.calculate_performance_percentile("agent3")?;
        assert_eq!(percentile, Some(50.0));
        
        let percentile = metrics.calculate_performance_percentile("agent2")?;
        assert_eq!(percentile, Some(75.0));
        
        let percentile = metrics.calculate_performance_percentile("agent4")?;
        assert_eq!(percentile, Some(25.0));
        
        Ok(())
    }

    #[test]
    fn test_calculate_performance_percentile_with_ties() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        metrics.add_execution_time("agent1", 100)?;
        metrics.add_execution_time("agent2", 100)?;
        metrics.add_execution_time("agent3", 200)?;
        
        let percentile1 = metrics.calculate_performance_percentile("agent1")?;
        let percentile2 = metrics.calculate_performance_percentile("agent2")?;
        let percentile3 = metrics.calculate_performance_percentile("agent3")?;
        
        assert_eq!(percentile1, Some(100.0));
        assert_eq!(percentile2, Some(100.0));
        assert_eq!(percentile3, Some(0.0));
        
        Ok(())
    }

    #[test]
    fn test_large_dataset_performance() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        for i in 0..1000 {
            let name = format!("agent{}", i % 10);
            metrics.add_execution_time(&name, (i % 100) as u64 * 10)?;
        }
        
        let top = metrics.get_top_performers(5)?;
        assert_eq!(top.len(), 5);
        
        for (agent_name, _, count) in top {
            assert_eq!(count, 100);
            assert!(agent_name.starts_with("agent"));
        }
        
        Ok(())
    }

    #[test]
    fn test_zero_duration_handling() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        metrics.add_execution_time("agent1", 0)?;
        metrics.add_execution_time("agent1", 100)?;
        
        assert_eq!(metrics.get_total_executions("agent1")?, 2);
        assert_eq!(metrics.get_average_time("agent1")?, Some(50.0));
        
        Ok(())
    }

    #[test]
    fn test_maximum_duration_handling() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        metrics.add_execution_time("agent1", u64::MAX)?;
        metrics.add_execution_time("agent1", 0)?;
        
        assert_eq!(metrics.get_total_executions("agent1")?, 2);
        let avg = metrics.get_average_time("agent1")?.unwrap();
        assert!(avg > 0.0);
        
        Ok(())
    }

    #[test]
    fn test_agent_name_edge_cases() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        metrics.add_execution_time("", 100)?;
        metrics.add_execution_time(" ", 200)?;
        metrics.add_execution_time("agent with spaces", 300)?;
        metrics.add_execution_time("agent-with-dashes", 400)?;
        metrics.add_execution_time("agent_with_underscores", 500)?;
        
        assert_eq!(metrics.get_total_executions("")?, 1);
        assert_eq!(metrics.get_total_executions(" ")?, 1);
        assert_eq!(metrics.get_total_executions("agent with spaces")?, 1);
        
        Ok(())
    }

    #[test]
    fn test_concurrent_additions_simulation() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        for i in 0..100 {
            metrics.add_execution_time("agent1", i)?;
            metrics.add_execution_time("agent2", i * 2)?;
            metrics.add_execution_time("agent3", i * 3)?;
        }
        
        assert_eq!(metrics.get_total_executions("agent1")?, 100);
        assert_eq!(metrics.get_total_executions("agent2")?, 100);
        assert_eq!(metrics.get_total_executions("agent3")?, 100);
        
        let avg1 = metrics.get_average_time("agent1")?.unwrap();
        let avg2 = metrics.get_average_time("agent2")?.unwrap();
        let avg3 = metrics.get_average_time("agent3")?.unwrap();
        
        assert!(avg1 < avg2);
        assert!(avg2 < avg3);
        
        Ok(())
    }

    #[test]
    fn test_percentile_calculation_precision() -> Result<()> {
        let mut metrics = AgentMetrics::new();
        
        for i in 1..=100 {
            metrics.add_execution_time(&format!("agent{}", i), i)?;
        }
        
        let percentile_1 = metrics.calculate_performance_percentile("agent1")?;
        let percentile_50 = metrics.calculate_performance_percentile("agent50")?;
        let percentile_100 = metrics.calculate_performance_percentile("agent100")?;
        
        assert_eq!(percentile_1, Some(100.0));
        assert_eq!(percentile_100, Some(0.0));
        assert!(percentile_50.unwrap() > 45.0 && percentile_50.unwrap() < 55.0);
        
        Ok(())
    }
}