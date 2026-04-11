// Production environment configuration for MarketFlow

export const environment = {
  production: true,
  supabase: {
    url: 'https://wqwijeadpwbfhabcnfna.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indxd2lqZWFkcHdiZmhhYmNuZm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1ODIxODUsImV4cCI6MjA4NDE1ODE4NX0.v3YSC7rZ67HUkkHTFqtEWTjdXQqBu4TISsOQTguiaOg'
  },
  grokApiUrl: 'https://api.groq.com/openai/v1/chat/completions',
  grokApiKey: '',
  // Update this to your deployed proxy server or the correct API endpoint with CORS enabled
  loginApiUrl: 'https://fm-data.herokuapp.com/api/tokens'
};
