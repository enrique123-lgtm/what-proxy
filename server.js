const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const HF_TOKEN = process.env.HF_TOKEN;
// Menggunakan model Llama 3 8B yang selalu standby dan cepat di Hugging Face
const HF_URL = 'https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct';

app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!HF_TOKEN) {
      return res.status(500).json({ error: "HF_TOKEN belum dikonfigurasi di Vercel!" });
    }

    const body = req.body;

    // Hugging Face Inference API membutuhkan format "inputs" untuk rute standar
    // Kita konversi format pesan dari Janitor AI agar dibaca sempurna oleh Hugging Face
    const systemInstruction = body.messages.find(m => m.role === 'system')?.content || '';
    const userConversations = body.messages.filter(m => m.role !== 'system').map(m => `${m.role}: ${m.content}`).join('\n');
    
    const formattedPrompt = `<|system|>\n${systemInstruction}\n<|user|>\n${userConversations}\n<|assistant|>\n`;

    const payload = {
      inputs: formattedPrompt,
      parameters: {
        max_new_tokens: body.max_tokens || 800,
        temperature: body.temperature || 0.7,
        return_full_text: false
      }
    };

    console.log("Sending clean request to Hugging Face...");

    // Tembak ke API Hugging Face
    const response = await fetch(HF_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("HF Error Response:", errorData);
      return res.status(response.status).send(errorData);
    }

    const result = await response.json();
    let replyText = "";

    // Ambil teks hasil generate dari Hugging Face
    if (Array.isArray(result) && result[0]?.generated_text) {
      replyText = result[0].generated_text;
    } else if (result.generated_text) {
      replyText = result.generated_text;
    }

    // Kembalikan formatnya menjadi JSON standar yang dimengerti Janitor AI
    const janitorResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'Meta-Llama-3-8B-Instruct',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: replyText.trim()
        },
        finish_reason: 'stop'
      }]
    };

    res.json(janitorResponse);

  } catch (error) {
    console.error("Proxy Error Detail:", error);
    res.status(500).json({ error: "Terjadi kesalahan internal pada server proxy Hugging Face." });
  }
});

app.get('/health', (req, res) => res.json({ status: "Hugging Face Native Proxy Aktif!" }));
app.use((req, res) => res.status(404).json({ error: `Rute ${req.url} tidak ditemukan.` }));

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Hugging Face Proxy running on port ${PORT}`);
  });
}

module.exports = app;
