import dotenv from 'dotenv';
dotenv.config();

import { createPromotionalVideo } from './src/services/video.service';
import { GoogleGenAI } from '@google/genai';

async function testVeo() {
  console.log("=== Testing Veo 3 (Video) ===");
  try {
    const videoResult = await createPromotionalVideo(
      "Futuristic Smartwatch",
      "A futuristic smartwatch.",
      "https://images.unsplash.com/photo-1542442828-287217bfb87f?ixlib=rb-4.0.3",
      "en"
    );
    console.log(`✅ Video generated successfully: ${videoResult.url}`);
  } catch (e: any) {
    console.error("❌ Error during test:", e?.message || e);
  }
}
testVeo();
