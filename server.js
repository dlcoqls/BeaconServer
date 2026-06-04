import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {cors : { origin: '*'}});

// 1. CORS 및 JSON 설정
app.use(cors());
app.use(express.json());

// 2. 구글 Gemini AI 초기화
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// [메모리 버퍼] 최신 비콘 데이터 임시 저장
let latestBeacon = null;

// 혼잡도 추적: { userId: { beaconId, lastSeen } }
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

// 비콘 데이터 수신 (안드로이드 앱이 쏴주는 신호 받는 곳)
app.post('/beacon', (req, res) => {
  console.log('--- 📱 안드로이드 비콘 데이터 수신 ---');
  console.log(req.body);
  latestBeacon = req.body;
  io.emit('location_update', latestBeacon);
  res.send({ success: true });
});

// 비콘 데이터 조회 (리액트 웹앱이 위치 가져가는 곳)
app.get('/beacon', (req, res) => {
  res.send(latestBeacon || {});
});

// 내 위치 신고 (핸드폰이 1초마다 호출)
// body: { userId: "고유ID", beaconId: "A1" }
app.post('/presence', (req, res) => {
  const { userId, beaconId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId 필요' });

  presenceMap.set(userId, { beaconId, lastSeen: Date.now() });
  res.json({ success: true });
});

// 혼잡도 조회
// 응답 예시: { congestion: { A1: 5, A2: 2 }, total: 7 }
app.get('/presence', (req, res) => {
  const congestion = getCongestion();
  const total = Object.values(congestion).reduce((a, b) => a + b, 0);
  res.json({ congestion, total });
});

// 제미나이 AI 챗봇
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: message,
      config: {
        systemInstruction: '당신은 전통시장 및 AI 실습실 가이드 도우미 "Guidant"입니다. 친절하고 간결하게 한국어로 답변해주세요.',
      },
    });
    res.json({ reply: response.text });
  } catch (error) {
    console.error('Gemini API 에러:', error);
    res.status(500).json({ error: '제미나이 응답 중 오류가 발생했습니다.' });
  }
});

// 서버 포트 3000번 실행
httpServer.listen(3000, () => {
  console.log('==================================================');
  console.log('🚀 Guidant 서버가 3000번 포트에서 가동 중입니다.');
  console.log('👉 안드로이드 전송 주소: http://컴퓨터IP:3000/beacon');
  console.log('👉 리액트 웹앱 조회 주소: http://localhost:3000/beacon');
  console.log('👉 혼잡도 조회 주소:     http://localhost:3000/presence');
  console.log('==================================================');
});