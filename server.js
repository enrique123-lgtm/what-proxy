// server.js - OpenAI to NVIDIA NIM API Proxy (Optimized for Janitor AI & Vercel)
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// NVIDIA NIM API configuration
const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

// MODEL MAPPING asli dari tutorial github pilihanmu
const MODEL_MAPPING = {
  'deepseek-v4-pro':   'deepseek-ai/deepseek-v4-pro',    
  'deepseek-v4-flash': 'deepseek-ai/deepseek-v4-flash',  
  'gpt-4':             'deepseek-ai/deepseek-v4-pro',      // Ini target kita (DeepSeek paling atas)
  'gpt-4o':            'deepseek-ai/deepseek-v4-flash',
  'gpt-3.5-turbo':  'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'gpt-4o-mini':    'nvidia/nemotron-3-super-120b-a12b',
  'gpt-4-faster':  'qwen/qwen3.5-122b-a10b',
  'mistral-medium':  'mistralai/mistral-medium-3.5-128b',
  'mistral-small':   'mistralai/mistral-small-4-119b-2603',
  'gemini-pro':      'mistralai/mistral-medium-3.5-128b',
  'glm-fast':   'z-ai/glm-4.7',
  'glm-pro':    'z-ai/glm-5.1',
  'minimax':    'minimaxai/minimax-m2.7',
  'gemma':      'google/gemma-4-31b-it',
  'claude-3-opus':   'openai/gpt-oss-120b',
  'claude-3-sonnet': 'openai/gpt-oss-20b',
};

// ROLEPLAY GUARD bawaan tutorial agar AI tidak mengendalikan chat kamu
const RP_GUARD_INSTRUCTION = `You are ONLY the character described in the system prompt or conversation. Follow these rules strictly:
- You ONLY speak, act, and think as the character. You do NEVER write or generate any dialogue, actions, or thoughts for the user.
- Stop your response immediately after your character's turn ends.`;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', nim_api_configured: !!NIM_API_KEY, optimized_for: 'Janitor AI + Vercel' });
});

app.get('/', (req, res) => {
  res.json({ service: 'OpenAI to NVIDIA NIM Proxy v2', status: 'running' });
});

app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!NIM_API_KEY) {
      return res.status(500).json({ error: { message: 'NIM_API_KEY / NIM_API_KEY belum dikonfigurasi di Vercel.' } });
    }

    const body = req.body;
    
    // Deteksi pemetaan model otomatis
    let nimModel = MODEL_MAPPING[body.model] || 'deepseek-ai/deepseek-v4-pro';
    body.model = nimModel;
    
    // Paksa nyalakan stream internal agar Vercel tidak terkena limit timeout 10 detik
    body.stream = true;

    // Sisipkan instruksi roleplay guard ke pesan sistem
    const systemIndex = body.messages.findIndex(m => m.role === 'system');
    if (systemIndex !== -1) {
      body.messages[systemIndex].content = body.messages[systemIndex].content + '\n\n' + RP_GUARD_INSTRUCTION;
    } else {
      body.messages.unshift({ role: 'system', content: RP_GUARD_INSTRUCTION });
    }

    console.log(`Mengalirkan data dari NVIDIA NIM menggunakan model asli: ${body.model}`);

    // Gunakan Fetch API bawaan yang jauh lebih stabil di Vercel Serverless dibanding Axios
    const response = await fetch(`${NIM_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("NVIDIA Error:", errorData);
      return res.status(response.status).send(errorData);
    }

    // Set Header Streaming agar klop dengan Janitor AI
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Alirkan data secara manual per fragmen (Chunk) agar lolos dari blokade Vercel gratisan
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();

  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

app.all('*', (req, res) => {
  res.status(404).json({ error: { message: `Endpoint ${req.path} tidak ditemukan.` } });
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => console.log(`Proxy running on port ${PORT}`));
}

module.exports = app;
