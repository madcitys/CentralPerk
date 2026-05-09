const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../centralperk-frontend/.env.local') });

module.exports = ({ config }) => {
  return {
    ...config,
    extra: {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      apiBaseUrl: process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:4000',
      enableDemoAuth: process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH || 'false',
      forceCustomerDemoAuth: process.env.NEXT_PUBLIC_FORCE_CUSTOMER_DEMO_AUTH || 'false',
    },
  };
};
