const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add 'mjs' to resolve Supabase JS packages correctly in Expo
config.resolver.sourceExts.push('mjs');

module.exports = config;
