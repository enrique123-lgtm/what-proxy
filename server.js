const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

const handleChat = async (req, res) => {
  try {
    if (!NVIDIA_API_KEY) {
      return res.status(500).json({ error: "NVIDIA_API_KEY belum dikonfigurasi di Vercel!" });
    }

    const body = req.body;

    // Pastikan fitur streaming menyala agar tidak terkena timeout 10 detik di Vercel
    body.stream = true;
    
    // Kunci model ke DeepSeek V3 resmi NVIDIA
    body.model = 'deepseek-ai/deepseek-v3';

    console.log(`Mengirim request streaming ke NVIDIA: ${body.model}`);

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
      console.error("NVIDIA Error:", errorData);
      return res.status(response.status).send(errorData);
    }

    // Set header khusus untuk streaming teks agar Janitor langsung membacanya sewaktu diketik
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Alirkan data secara mentah (raw stream) langsung dari NVIDIA ke Janitor AI
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Kirim potongan teks langsung tanpa ditahan di server proxy
      res.write(value);
    }
    res.end();

  } catch (error) {
    console.error("Proxy Stream Error:", error);
    res.status(500).json({ error: "Terjadi kesalahan internal pada server proxy streaming." });
  }
};

app.post('/v1/chat/completions', handleChat);
app.post('/', handleChat);

app.get('/health', (req, res) => res.json({ status: "NVIDIA Stream Proxy Ready!" }));
app.get('/', (req, res) => res.json({ status: "Server Berjalan Lancar!" }));

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Proxy running on port ${PORT}`);
  });
}

module.exports = app;
