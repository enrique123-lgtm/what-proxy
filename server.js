const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Ambil API Key dari Environment Variable Vercel
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY belum dikonfigurasi di Vercel!" });
    }

    const body = req.body;

    // Bersihkan parameter bawaan Janitor yang sering bikin error di beberapa server
    delete body.repetition_penalty;
    delete body.logit_bias;
    delete body.top_logprobs;

    // PAKSA MENGGUNAKAN MODEL GRATISAN TERBAIK DARI OPENROUTER
    // Model ini 100% Free, Tanpa Limit Ketat, Bagus buat Roleplay/Narrative
    body.model = 'meta-llama/llama-3.1-8b-instruct:free';

    console.log(`Sending request to OpenRouter Free using model: ${body.model}`);

    // Tembak ke API OpenRouter
    const response = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://janitorai.com', // Formalitas syarat OpenRouter
        'X-Title': 'Janitor AI Proxy'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).send(errorData);
    }

    // Teruskan balasan langsung ke Janitor AI (Mendukung Streaming teks)
    res.setHeader('Content-Type', req.headers['content-type'] || 'application/json');
    if (body.stream) {
      res.setHeader('Transfer-Encoding', 'chunked');
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();

  } catch (error) {
    console.error("Proxy Error:", error);
    res.status(500).json({ error: "Terjadi kesalahan pada server proxy." });
  }
});

app.get('/health', (req, res) => res.json({ status: "OpenRouter Free Proxy Aktif!" }));
app.use((req, res) => res.status(404).json({ error: `Rute ${req.url} tidak ditemukan.` }));

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 OpenRouter Proxy running on port ${PORT}`);
  });
}

module.exports = app;
