const { env } = require("../config/env");

async function callAiService(_path, _payload) {
  throw new Error(`AI service integration pending: ${env.aiServiceUrl}`);
}

module.exports = { callAiService };

