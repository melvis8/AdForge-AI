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
const genblaze_service_1 = require("./src/services/genblaze.service");
const LANG_NAMES = {
    en: 'English', fr: 'French', es: 'Spanish',
};
function testLanguages() {
    return __awaiter(this, void 0, void 0, function* () {
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
                const description = yield (0, genblaze_service_1.geminiGenerate)(descriptionPrompt);
                console.log(`\nDescription (${LANG_NAMES[item.lang]}):\n${description}`);
                // Simulate caption generation
                const captionPrompt = `Write a short, engaging 30-word social media caption in ${LANG_NAMES[item.lang]} for this campaign: ${description}`;
                const caption = yield (0, genblaze_service_1.geminiGenerate)(captionPrompt);
                console.log(`\nCaption (${LANG_NAMES[item.lang]}):\n${caption}`);
            }
            catch (e) {
                console.error("❌ Failed:", e === null || e === void 0 ? void 0 : e.message);
            }
        }
    });
}
testLanguages();
