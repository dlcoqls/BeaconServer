import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Groq from 'groq-sdk';
import 'dotenv/config';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {cors : { origin: '*'}});

app.use(cors());
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function generateWithRetry(prompt) {
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: '당신은 전통시장 및 AI 실습실 가이드 도우미 "Guidant"입니다. 친절하고 간결하게 한국어로 답변해주세요.' },
      { role: 'user', content: prompt }
    ],
  });
  return { text: response.choices[0].message.content };
}

let latestBeacon = null;

const presenceMap = new Map();
const TIMEOUT_MS = 30000;

function cleanupPresence() {
  const now = Date.now();
  for (const [id, data] of presenceMap.entries()) {
    if (now - data.lastSeen > TIMEOUT_MS) {
      presenceMap.delete(id);
    }
  }
}

function getCongestion() {
  cleanupPresence();
  const counts = {};
  for (const data of presenceMap.values()) {
    if (data.beaconId) {
      counts[data.beaconId] = (counts[data.beaconId] || 0) + 1;
    }
  }
  return counts;
}

app.post('/beacon', (req, res) => {
  console.log('--- 📱 안드로이드 비콘 데이터 수신 ---');
  console.log(req.body);
  latestBeacon = req.body;
  io.emit('location_update', latestBeacon);
  res.send({ success: true });
});

app.get('/beacon', (req, res) => {
  res.send(latestBeacon || {});
});

app.post('/presence', (req, res) => {
  const { userId, beaconId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId 필요' });
  presenceMap.set(userId, { beaconId, lastSeen: Date.now() });
  res.json({ success: true });
});

app.get('/presence', (req, res) => {
  const congestion = getCongestion();
  const total = Object.values(congestion).reduce((a, b) => a + b, 0);
  res.json({ congestion, total });
});

// ✅ /chat도 generateWithRetry 사용하도록 수정
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message 필요' });

    const response = await generateWithRetry(message);
    res.json({ reply: response.text });
  } catch (error) {
    console.error('Gemini API 에러:', error);
    const is429 = error.status === 429;
    res.status(is429 ? 429 : 500).json({
      error: is429
        ? '현재 AI 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
        : '제미나이 응답 중 오류가 발생했습니다.',
    });
  }
});

httpServer.listen(3000, () => {
  console.log('==================================================');
  console.log('🚀 Guidant 서버가 3000번 포트에서 가동 중입니다.');
  console.log('👉 안드로이드 전송 주소: http://컴퓨터IP:3000/beacon');
  console.log('👉 리액트 웹앱 조회 주소: http://localhost:3000/beacon');
  console.log('👉 혼잡도 조회 주소:     http://localhost:3000/presence');
  console.log('==================================================');
});