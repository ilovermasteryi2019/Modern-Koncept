require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_KEY });

async function testAI() {
  console.log('==============================================');
  console.log('🔑 Testing Google AI API Key...');
  console.log('Key status:', process.env.GOOGLE_AI_KEY ? '✅ Key found in .env' : '❌ Key is MISSING');
  console.log('==============================================');

  try {
    console.log('📡 Sending test request to Gemini...');

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: 'Say exactly this: API is working!',
    });

    console.log('==============================================');
    console.log('✅ SUCCESS! API is connected and working.');
    console.log('🤖 Gemini replied:', response.text);
    console.log('==============================================');

  } catch (error) {
    console.log('==============================================');
    console.error('❌ FAILED! API test error:', error.message);
    console.log('==============================================');
  }
}

testAI();