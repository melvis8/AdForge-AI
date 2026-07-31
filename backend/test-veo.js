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
function testVeo() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("=== Testing Veo 3 (Video) ===");
        try {
            const videoResult = yield (0, video_service_1.createPromotionalVideo)("Futuristic Smartwatch", "A futuristic smartwatch.", "https://images.unsplash.com/photo-1542442828-287217bfb87f?ixlib=rb-4.0.3", "en");
            console.log(`✅ Video generated successfully: ${videoResult.url}`);
        }
        catch (e) {
            console.error("❌ Error during test:", (e === null || e === void 0 ? void 0 : e.message) || e);
        }
    });
}
testVeo();
