const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Ambil API Key dari Environment Variable Vercel
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Jalur utama untuk Janitor AI
app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY belum dikonfigurasi di Vercel!" });
    }

    // Ambil data request dari Janitor AI
    const body = req.body;

    // Pemetaan Model Otomatis dari Janitor ke Groq
    // Jika di Janitor kamu pilih gpt-4 atau gpt-4o, otomatis diganti ke model monster Llama 3 70B milik Groq
    if (body.model.startsWith('gpt-4') || body.model.startsWith('deepseek')) {
      body.model = 'llama-3.3-70b-versatile';
    } else {
      // Jika pilih model lain, otomatis pakai Llama 3 8B yang super kilat
      body.model = 'llama-3.1-8b-instant';
    }

    console.log(`Sending request to Groq using model: ${body.model}`);

    // Tembak ke API Groq
    const response = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    // Jika server Groq mengembalikan error
    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).send(errorData);
    }

    // Teruskan balasan dari Groq langsung ke Janitor AI (Mendukung Streaming teks)
    res.setHeader('Content-Type', req.headers['content-type'] || 'application/json');
    if (body.stream) {
      res.setHeader('Transfer-Encoding', 'chunked');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

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

// Jalur cadangan untuk cek status
app.get('/health', (req, res) => res.json({ status: "Groq Proxy Aktif!" }));
app.use((req, res) => res.status(404).json({ error: `Rute ${req.url} tidak ditemukan.` }));

// Konfigurasi Serverless Vercel
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Groq Proxy running on port ${PORT}`);
  });
}

module.exports = app;
