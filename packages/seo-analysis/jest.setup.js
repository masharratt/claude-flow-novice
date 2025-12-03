const { config } = require('dotenv');
const { resolve } = require('path');

// Load root .env file
config({ path: resolve(__dirname, '../../.env') });
