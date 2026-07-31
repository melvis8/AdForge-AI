"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const video_service_1 = require("./src/services/video.service");
const storage_service_1 = require("./src/services/storage.service");
const genai_1 = require("@google/genai");
const genblaze_service_1 = require("./src/services/genblaze.service");
const gemini = new genai_1.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
function testAI() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        console.log("=== Testing Nano Banana (Image) ===");
        try {
            const prompt = "A high-quality cinematic poster of a futuristic smartwatch floating in space, glowing with neon blue lights.";
            console.log(`Prompt: ${prompt}`);
            const response = yield gemini.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: prompt,
                config: { responseModalities: ['TEXT', 'IMAGE'] },
            });
            let imageBuffer = null;
            const parts = ((_c = (_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) || [];
            for (const part of parts) {
                if ((_d = part.inlineData) === null || _d === void 0 ? void 0 : _d.data) {
                    imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                }
            }
            if (imageBuffer) {
                console.log(`✅ Image generated successfully. Size: ${imageBuffer.length} bytes.`);
                console.log("Uploading to Backblaze...");
                const imageUrl = yield (0, storage_service_1.uploadBuffer)(imageBuffer, `test_campaign/poster_${Date.now()}.jpg`, 'image/jpeg');
                console.log(`✅ Image uploaded to Backblaze: ${imageUrl}`);
                testVideo(prompt, imageUrl);
            }
            else {
                console.error("❌ Failed to extract image buffer from Gemini response.");
                console.error(JSON.stringify(response, null, 2));
                console.log("Proceeding to test video with dummy image...");
                testVideo(prompt, "https://via.placeholder.com/512");
            }
        }
        catch (e) {
            console.error("❌ Error during image test:", (e === null || e === void 0 ? void 0 : e.message) || e);
            console.log("Proceeding to test video with dummy image...");
            testVideo("Futuristic Smartwatch", "https://via.placeholder.com/512");
        }
        console.log("\n=== Testing Qwen Text Fallback ===");
        try {
            // Calling geminiGenerate which should fail or rate limit and fall back to openRouterGenerate
            const textFallbackResult = yield (0, genblaze_service_1.geminiGenerate)("What is the meaning of life? (Answer in exactly 5 words)", "gemini-invalid-model");
            console.log(`✅ Text Generation result: ${textFallbackResult}`);
        }
        catch (e) {
            console.error("❌ Error during text generation test:", (e === null || e === void 0 ? void 0 : e.message) || e);
        }
    });
}
function testVideo(prompt, imageUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("\n=== Testing Veo 3 (Video) ===");
        console.log(`Prompt: ${prompt}`);
        try {
            const videoResult = yield (0, video_service_1.createPromotionalVideo)("Futuristic Smartwatch", prompt, imageUrl, "en");
            console.log(`✅ Video generated successfully: ${videoResult.url}`);
            // Test uploading it
            const fs = require('fs');
            if (videoResult.url.startsWith('/')) {
                const videoBuffer = fs.readFileSync(videoResult.url);
                const uploadedUrl = yield (0, storage_service_1.uploadBuffer)(videoBuffer, `test_campaign/video_${Date.now()}.mp4`, 'video/mp4');
                console.log(`✅ Video uploaded to Backblaze: ${uploadedUrl}`);
            }
        }
        catch (e) {
            console.error("❌ Error during video test:", (e === null || e === void 0 ? void 0 : e.message) || e);
        }
    });
}
testAI();
