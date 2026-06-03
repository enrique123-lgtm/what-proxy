const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const body = req.body;

    // Bersihkan parameter bawaan Janitor agar formatnya bersih 100%
    delete body.repetition_penalty;
    delete body.frequency_penalty;
    delete body.presence_penalty;
    delete body.logit_bias;
    delete body.top_logprobs;
    delete body.top_k;

    // KUNCI MODEL TERBAIK POLLINATIONS
    // Pilihan: 'llama' (Llama 3.1 70B - Pintar) atau 'mistral' (Mistral Nemo - Kreatif)
    body.model = 'llama'; 

    console.log(`Sending request to Pollinations AI using model: ${body.model}`);

    // Tembak langsung ke API Publik Pollinations
    const response = await fetch(POLLINATIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).send(errorData);
    }

    // Teruskan balasan ke Janitor AI (Mendukung Streaming teks biar ngetik langsung)
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
    res.status(500).json({ error: "Terjadi kesalahan pada server proxy Pollinations." });
  }
});

app.get('/health', (req, res) => res.json({ status: "Pollinations Proxy Aktif Selamanya!" }));
app.use((req, res) => res.status(404).json({ error: `Rute ${req.url} tidak ditemukan.` }));

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Pollinations Proxy running on port ${PORT}`);
  });
}

module.exports = app;
