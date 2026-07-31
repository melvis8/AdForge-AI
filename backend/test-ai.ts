import dotenv from 'dotenv';
dotenv.config();

import { createPromotionalVideo } from './src/services/video.service';
import { uploadBuffer } from './src/services/storage.service';
import { GoogleGenAI } from '@google/genai';
import { geminiGenerate } from './src/services/genblaze.service';

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

async function testAI() {
  console.log("=== Testing Nano Banana (Image) ===");
  try {
    const prompt = "A high-quality cinematic poster of a futuristic smartwatch floating in space, glowing with neon blue lights.";
    console.log(`Prompt: ${prompt}`);
    
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: prompt,
      config: { responseModalities: ['TEXT', 'IMAGE'] },
    });

    let imageBuffer: Buffer | null = null;
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        imageBuffer = Buffer.from(part.inlineData.data, 'base64');
      }
    }

    if (imageBuffer) {
      console.log(`✅ Image generated successfully. Size: ${imageBuffer.length} bytes.`);
      console.log("Uploading to Backblaze...");
      const imageUrl = await uploadBuffer(imageBuffer, `test_campaign/poster_${Date.now()}.jpg`, 'image/jpeg');
      console.log(`✅ Image uploaded to Backblaze: ${imageUrl}`);
      
      testVideo(prompt, imageUrl);
    } else {
      console.error("❌ Failed to extract image buffer from Gemini response.");
      console.error(JSON.stringify(response, null, 2));
      console.log("Proceeding to test video with dummy image...");
      testVideo(prompt, "https://via.placeholder.com/512");
    }
  } catch (e: any) {
    console.error("❌ Error during image test:", e?.message || e);
    console.log("Proceeding to test video with dummy image...");
    testVideo("Futuristic Smartwatch", "https://via.placeholder.com/512");
  }

  console.log("\n=== Testing Qwen Text Fallback ===");
  try {
    // Calling geminiGenerate which should fail or rate limit and fall back to openRouterGenerate
    const textFallbackResult = await geminiGenerate("What is the meaning of life? (Answer in exactly 5 words)", "gemini-invalid-model");
    console.log(`✅ Text Generation result: ${textFallbackResult}`);
  } catch (e: any) {
    console.error("❌ Error during text generation test:", e?.message || e);
  }
}

async function testVideo(prompt: string, imageUrl: string) {
  console.log("\n=== Testing Veo 3 (Video) ===");
  console.log(`Prompt: ${prompt}`);
  try {
    const videoResult = await createPromotionalVideo(
      "Futuristic Smartwatch",
      prompt,
      imageUrl,
      "en"
    );
    console.log(`✅ Video generated successfully: ${videoResult.url}`);
    
    // Test uploading it
    const fs = require('fs');
    if (videoResult.url.startsWith('/')) {
      const videoBuffer = fs.readFileSync(videoResult.url);
      const uploadedUrl = await uploadBuffer(videoBuffer, `test_campaign/video_${Date.now()}.mp4`, 'video/mp4');
      console.log(`✅ Video uploaded to Backblaze: ${uploadedUrl}`);
    }
  } catch (e: any) {
    console.error("❌ Error during video test:", e?.message || e);
  }
}

testAI();
