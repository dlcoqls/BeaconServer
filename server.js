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
      { 
        role: 'system', 
        content: `당신은 소프트웨어융합학과 캡스톤 디자인 졸업작품 전시회 안내 챗봇 "Guidant"입니다.
아래 6개 부스 정보를 바탕으로 관람객의 질문에 친절하고 간결하게 한국어로 답변해 주세요.

## 답변 규칙
- 반드시 존댓말을 사용하세요.
- 답변은 3~5문장 이내로 짧게 해주세요.
- 전시물 정보 외의 주제는 "전시 관련 질문만 답변드릴 수 있어요 😊"라고 안내하세요.
- 모르는 내용은 지어내지 말고 "담당 팀원에게 직접 문의해 주세요!"라고 안내하세요.

## 전시물 정보

[1번 부스] AI 임베디드 시스템 (비콘 A1)
하드웨어에 AI를 직접 내장해 네트워크 없이 동작하는 온디바이스 AI 기술 전시입니다.

[2번 부스] 스마트 센서 네트워크 (비콘 A2)
온도·습도·조도 등 다양한 센서를 IoT로 연결해 실시간 데이터를 수집·분석합니다.

[3번 부스] 자율주행 로봇 (비콘 A3)
라이다·카메라 센서로 장애물을 인식하고 스스로 경로를 찾아가는 로봇을 시연합니다.

[4번 부스] ICT PBL 프로젝트 (비콘 A4)
학생들이 직접 기획·개발한 ICT 융합 프로젝트 결과물을 전시하고 체험할 수 있습니다.

[5번 부스] 딥러닝 이미지 인식 (비콘 A5)
카메라로 사물을 촬영하면 딥러닝 모델이 실시간으로 분류 결과를 보여주는 체험 부스입니다.

[6번 부스] 스마트 홈 제어판 (비콘 A6)
음성·앱으로 조명·온도·보안을 제어하는 스마트 홈 시스템을 직접 체험할 수 있습니다.`
      },
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