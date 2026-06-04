import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const app = express();

app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let latestBeacon = null;

// 혼잡도 추적: { socketId: { beaconId, lastSeen } }
const presenceMap = new Map();
const TIMEOUT_MS = 30000; // 30초 안 보내면 자동 제거

// 만료된 유저 정리
function cleanupPresence() {
  const now = Date.now();
  for (const [id, data] of presenceMap.entries()) {
    if (now - data.lastSeen > TIMEOUT_MS) {
      presenceMap.delete(id);
    }
  }
}

// 혼잡도 집계: { A1: 3, A2: 1 } 형태로 반환
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

// 비콘 데이터 수신
app.post('/beacon', (req, res) => {
  console.log(req.body);
  latestBeacon = req.body;
  res.send({ success: true });
});

// 비콘 데이터 조회
app.get('/beacon', (req, res) => {
  res.send(latestBeacon || {});
});

// 🆕 내 위치 신고 (핸드폰이 1초마다 호출)
// body: { userId: "고유ID", beaconId: "A1" }
app.post('/presence', (req, res) => {
  const { userId, beaconId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId 필요' });

  presenceMap.set(userId, { beaconId, lastSeen: Date.now() });
  res.json({ success: true });
});

// 🆕 혼잡도 조회
// 응답 예시: { congestion: { A1: 5, A2: 2 }, total: 7 }
app.get('/presence', (req, res) => {
  const congestion = getCongestion();
  const total = Object.values(congestion).reduce((a, b) => a + b, 0);
  res.json({ congestion, total });
});

// 제미나이 챗봇
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: message,
      config: {
        systemInstruction: '당신은 전시 가이드 도우미 "Guidant"입니다. 친절하고 간결하게 한국어로 답변해주세요.',
      },
    });
    res.json({ reply: response.text });
  } catch (error) {
    console.error('Gemini API 에러:', error);
    res.status(500).json({ error: '제미나이 응답 중 오류가 발생했습니다.' });
  }
});

app.listen(3000, () => {
  console.log('서버 실행중 :3000');
});
