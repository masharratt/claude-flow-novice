// Health check endpoint
export const healthCheck = async () => {
  return {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  };
};

// For local testing
if (require.main === module) {
  console.log("SEO Intelligence Platform starting...");
  healthCheck().then((result) => {
    console.log("Health check:", result);
  });
}
