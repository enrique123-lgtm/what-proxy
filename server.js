// server.js - OpenAI to NVIDIA NIM API Proxy (Optimized for Janitor AI)
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// NVIDIA NIM API configuration
const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

// 🔥 REASONING DISPLAY TOGGLE - Shows/hides reasoning in output
const SHOW_REASONING = process.env.SHOW_REASONING === 'true' || false;

// 🔥 THINKING MODE TOGGLE - Enables thinking for specific models that support it
const ENABLE_THINKING_MODE = process.env.ENABLE_THINKING_MODE === 'true' || false;

// 🎯 MODEL MAPPING — verified against build.nvidia.com/models (May 2025)
const MODEL_MAPPING = {
  // --- DeepSeek (confirmed live on NIM) ---
  'deepseek-v4-pro':   'deepseek-ai/deepseek-v4-pro',    // 1M ctx, flagship MoE
  'deepseek-v4-flash': 'deepseek-ai/deepseek-v4-flash',  // 1M ctx, fast 284B MoE
  'gpt-4':             'deepseek-ai/deepseek-v4-pro',
  'gpt-4o':            'deepseek-ai/deepseek-v4-flash',

  // --- NVIDIA Nemotron ---
  'gpt-3.5-turbo':  'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'gpt-4o-mini':    'nvidia/nemotron-3-super-120b-a12b',

  // --- Qwen ---
  'gpt-4-faster':  'qwen/qwen3.5-122b-a10b',

  // --- Mistral (free endpoints) ---
  'mistral-medium':  'mistralai/mistral-medium-3.5-128b',
  'mistral-small':   'mistralai/mistral-small-4-119b-2603',
  'gemini-pro':      'mistralai/mistral-medium-3.5-128b',

  // --- GLM (Z.ai, free endpoint) ---
  'glm-fast':   'z-ai/glm-4.7',
  'glm-pro':    'z-ai/glm-5.1',

  // --- MiniMax (free endpoint) ---
  'minimax':    'minimaxai/minimax-m2.7',

  // --- Google ---
  'gemma':      'google/gemma-4-31b-it',

  // --- OpenAI OSS (via NIM) ---
  'claude-3-opus':   'openai/gpt-oss-120b',
  'claude-3-sonnet': 'openai/gpt-oss-20b',
};

// 🛡️ ROLEPLAY GUARD - Injected into every request to prevent the model from speaking as the user
const RP_GUARD_INSTRUCTION = `You are ONLY the character described in the system prompt or conversation. Follow these rules strictly:
- You ONLY speak, act, and think as the character. You do NEVER write or generate any dialogue, actions, or thoughts for the user or any other character that the user is playing.
- Do NOT use labels like "User:", "Human:", "You:" or any prefix to simulate the user's side of the conversation.
- Do NOT continue the conversation by inventing what the user says or does next.
- Stop your response immediately after your character's turn ends.
- If you feel the scene needs a reaction from the user, end your response and wait.`;

function stripUserBreakout(text) {
  const lines = text.split('\n');
  const cleaned = [];
  let dropping = false;

  const userLabels = [
    /^(User|Human|You|Me|Player)\s*[:：]/i,
    /^---+\s*$/,
    /^\*{0,3}\s*(User|Human|You|Me|Player)\s*\*{0,3}\s*[:：]/i
  ];

  for (const line of lines) {
    const trimmed = line.trim();

    if (userLabels.some(pattern => pattern.test(trimmed))) {
      dropping = true;
      continue;
    }

    if (dropping) {
      if (trimmed === '') continue;
      if (trimmed.startsWith('*')) {
        dropping = false;
        cleaned.push(line);
      }
      continue;
    }

    cleaned.push(line);
  }

  const result = cleaned.join('\n');
  const lastUserLabel = result.search(/\n(?:User|Human|You|Me|Player)\s*[:：]/i);
  if (lastUserLabel !== -1) {
    return result.substring(0, lastUserLabel).trimEnd();
  }

  return result.trimEnd();
}

const THINKING_MODELS = [
  'deepseek-ai/deepseek-v4-pro',
  'deepseek-ai/deepseek-v4-flash',
  'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'nvidia/nemotron-3-super-120b-a12b',
  'qwen/qwen3.5-122b-a10b',
  'mistralai/mistral-medium-3.5-128b',
  'mistralai/mistral-small-4-119b-2603',
  'z-ai/glm-5.1',
  'minimaxai/minimax-m2.7',
];

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'OpenAI to NVIDIA NIM Proxy (Janitor AI Optimized)', 
    reasoning_display: SHOW_REASONING,
    thinking_mode: ENABLE_THINKING_MODE,
    nim_api_configured: !!NIM_API_KEY,
    available_models: Object.keys(MODEL_MAPPING).length,
    optimized_for: 'Janitor AI'
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'OpenAI to NVIDIA NIM Proxy',
    version: '2.0',
    optimized_for: 'Janitor AI',
    status: 'running',
    endpoints: {
      health: '/health',
      models: '/v1/models',
      chat: '/v1/chat/completions'
    }
  });
});

app.get('/v1/models', (req, res) => {
  const models = Object.keys(MODEL_MAPPING).map(model => ({
    id: model,
    object: 'model',
    created: Date.now(),
    owned_by: 'nvidia-nim-proxy'
  }));
  res.json({ object: 'list', data: models });
});

app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!NIM_API_KEY) {
      return res.status(500).json({ error: { message: 'NIM_API_KEY not configured.' } });
    }

    const { model, messages, temperature, max_tokens, stream } = req.body;
    let nimModel = MODEL_MAPPING[model] || 'deepseek-ai/deepseek-v4-pro';
    
    const systemIndex = messages.findIndex(m => m.role === 'system');
    if (systemIndex !== -1) {
      messages[systemIndex].content = messages[systemIndex].content + '\n\n' + RP_GUARD_INSTRUCTION;
    } else {
      messages.unshift({ role: 'system', content: RP_GUARD_INSTRUCTION });
    }

    const nimRequest = {
      model: nimModel,
      messages: messages,
      temperature: temperature || 0.7,
      max_tokens: max_tokens || 12000,
      stream: stream || false
    };

    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: { 'Authorization': `Bearer ${NIM_API_KEY}`, 'Content-Type': 'application/json' },
      responseType: stream ? 'stream' : 'json'
    });
    
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      response.data.pipe(res);
    } else {
      res.json(response.data);
    }
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

app.all('*', (req, res) => {
  res.status(404).json({ error: { message: `Endpoint ${req.path} not found.` } });
});

app.listen(PORT, '0.0.0.0');
