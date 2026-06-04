import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';
const app = express();

// 1. CORS 및 JSON 설정 (프론트엔드와 안전하게 통신하기 위함)
app.use(cors());
app.use(express.json());

// 2. 구글 Gemini AI 초기화
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let latestBeacon = null;

// [기존 코드] 비콘 데이터 수신
app.post('/beacon', (req, res) => {
  console.log(req.body);
  latestBeacon = req.body;
  res.send({ success: true });
});

// [기존 코드] 비콘 데이터 조회
app.get('/beacon', (req, res) => {
  res.send(latestBeacon || {});
});

// 🚀 [추가된 코드] 제미나이 AI 챗봇 라우터
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    // gemini-2.5-flash 모델로 질문 보내기
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: message,
      config: {
        // 우리 가이드 앱 "Guidant"에 맞게 정체성 부여
        systemInstruction: '당신은 전통시장 및 AI 실습실 가이드 도우미 "Guidant"입니다. 친절하고 간결하게 한국어로 답변해주세요.'
      }
    });

    // 제미나이가 준 답변을 리액트로 리턴
    res.json({ reply: response.text });
  } catch (error) {
    console.error('Gemini API 에러:', error);
    res.status(500).json({ error: '제미나이 응답 중 오류가 발생했습니다.' });
  }
});

// 3. 서버 포트 3000번 실행
app.listen(3000, () => {
  console.log('서버 실행중');
});