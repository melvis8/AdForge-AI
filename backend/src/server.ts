import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/api.routes';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check root route (fixes "Cannot GET /")
app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'AdForge AI API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api', apiRoutes);

app.listen(port, () => {
  console.log(`🚀 AdForge AI Server running on port ${port}`);
});
