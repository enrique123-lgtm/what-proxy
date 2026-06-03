const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

// Menangkap rute utama maupun rute /v1/chat/completions sekaligus agar anti-error 404
const handleChat = async (req, res) => {
  try {
    if (!NVIDIA_API_KEY) {
      return res.status(500).json({ error: "NVIDIA_API_KEY belum dikonfigurasi di Vercel!" });
    }

    const body = req.body;

    // Kunci model ke DeepSeek V3 resmi yang terdaftar di NVIDIA
    body.model = 'deepseek-ai/deepseek-v3';

    console.log(`Mengirim request ke NVIDIA API menggunakan model: ${body.model}`);

    // Tembak ke API NVIDIA
    const response = await fetch(NVIDIA_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("NVIDIA Error Response:", errorData);
      return res.status(response.status).send(errorData);
    }

    // Teruskan balasan langsung ke Janitor AI (Mendukung Streaming)
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
    console.error("Proxy Error Detail:", error);
    res.status(500).json({ error: "Terjadi kesalahan internal pada server proxy." });
  }
};

// Pasang handler di semua rute yang mungkin ditembak Janitor AI
app.post('/v1/chat/completions', handleChat);
app.post('/', handleChat);

app.get('/health', (req, res) => res.json({ status: "NVIDIA Proxy Ready!" }));
app.get('/', (req, res) => res.json({ status: "Server Proxy Berjalan Lancar!" }));

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Proxy running on port ${PORT}`);
  });
}

module.exports = app;
