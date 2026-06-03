const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Menggunakan Token dari Vercel
const HF_TOKEN = process.env.HF_TOKEN;
// Menggunakan model kasta tertinggi Qwen 2.5 72B (Gratis & Sangat Pintar)
const HF_URL = 'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions';

app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!HF_TOKEN) {
      return res.status(500).json({ error: "HF_TOKEN belum dikonfigurasi di Vercel!" });
    }

    const body = req.body;

    // Bersihkan parameter bawaan Janitor agar formatnya klop dengan Hugging Face

    // Paksa set model agar sesuai dengan endpoint URL
    body.model = 'Qwen/Qwen2.5-72B-Instruct';

    console.log(`Sending request to Hugging Face using model: ${body.model}`);

    // Tembak ke API Hugging Face
    const response = await fetch(HF_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).send(errorData);
    }

    // Teruskan balasan langsung ke Janitor AI dengan dukungan Streaming
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
    res.status(500).json({ error: "Terjadi kesalahan pada server proxy Hugging Face." });
  }
});

app.get('/health', (req, res) => res.json({ status: "Hugging Face Proxy Aktif!" }));
app.use((req, res) => res.status(404).json({ error: `Rute ${req.url} tidak ditemukan.` }));

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Hugging Face Proxy running on port ${PORT}`);
  });
}

module.exports = app;
