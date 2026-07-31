import dotenv from 'dotenv';
dotenv.config();

import { geminiGenerate } from './src/services/genblaze.service';

const LANG_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', es: 'Spanish',
};

async function testLanguages() {
  const prompts = [
    { lang: 'en', prompt: "A cozy coffee shop in New York serving organic pastries." },
    { lang: 'fr', prompt: "Un restaurant gastronomique français à Paris avec vue sur la Tour Eiffel." },
    { lang: 'es', prompt: "Una escuela de surf en las hermosas playas de Costa Rica." }
  ];

  for (const item of prompts) {
    console.log(`\n=== Testing Campaign Flow for: ${LANG_NAMES[item.lang]} ===`);
    console.log(`User Prompt: "${item.prompt}"`);
    
    // Simulate what generateDetailedDescription does
    const descriptionPrompt = `CRITICAL: You MUST write your entire response in ${LANG_NAMES[item.lang]}. Expand this into a detailed campaign brief (50 words). User prompt: "${item.prompt}"`;
    
    try {
      const description = await geminiGenerate(descriptionPrompt);
      console.log(`\nDescription (${LANG_NAMES[item.lang]}):\n${description}`);
      
      // Simulate caption generation
      const captionPrompt = `Write a short, engaging 30-word social media caption in ${LANG_NAMES[item.lang]} for this campaign: ${description}`;
      const caption = await geminiGenerate(captionPrompt);
      console.log(`\nCaption (${LANG_NAMES[item.lang]}):\n${caption}`);
    } catch (e: any) {
      console.error("❌ Failed:", e?.message);
    }
  }
}

testLanguages();
