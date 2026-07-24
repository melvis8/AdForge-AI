# AdForge AI

"Create professional marketing campaigns from your phone using AI."

## Product Vision

AdForge AI is a mobile AI marketing assistant designed for small business owners, entrepreneurs, and creators who need professional advertising content but cannot afford designers, marketing agencies, or expensive tools.

The application transforms simple business information, product photos, and voice descriptions into complete marketing campaigns.

## Architecture

The system consists of two main components:

1. **Mobile Application (Frontend)**
   - Built with React Native & Expo
   - Styled with NativeWind (Tailwind CSS)
   - Handles voice input (Speech-to-text)
   - Communicates with backend via REST APIs

2. **Backend API**
   - Node.js & Express.js server
   - Prisma ORM & PostgreSQL (Configured for SQLite out-of-the-box for local testing)
   - Integration with Backblaze B2 for storage
   - Genblaze orchestrator for AI agents

## Online & Offline Strategy

- **Online Workflow**: AdForge connects to Genblaze to orchestrate AI agents for image generation, captions, marketing plans, and more. Files are stored securely in Backblaze B2.
- **Offline Workflow**: Users can access pre-generated marketing templates, browse saved campaigns, and get basic marketing ideas from a local SQLite database/AsyncStorage when the internet is disconnected.

## AI Workflow (Genblaze)

The AI workflow is orchestrated seamlessly on the backend:
1. **User Input** (Voice or text) & Image upload.
2. **Image Analysis Agent** understands the product.
3. **Marketing Strategy Agent** creates a plan.
4. **Caption & Creative Agents** generate text and images.
5. **Storage** in Backblaze B2.
6. **Mobile App** receives and displays the campaign.

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Backend Setup
1. Navigate to \`backend/\` directory.
2. Install dependencies: \`npm install\`
3. Setup environment variables (Create \`.env\`):
   \`\`\`
   B2_APP_KEY_ID=your_id
   B2_APP_KEY=your_key
   B2_BUCKET_ID=your_bucket
   B2_BUCKET_NAME=your_bucket_name
   PORT=3000
   \`\`\`
4. Run DB migrations: \`npx prisma db push\`
5. Start server: \`npm run dev\`

### Mobile Setup
1. Navigate to \`mobile/\` directory.
2. Install dependencies: \`npm install\`
3. Start Expo development server: \`npx expo start\`
4. Use Expo Go on your mobile device to scan the QR code and test the app.
