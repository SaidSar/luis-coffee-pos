import 'dotenv/config'; // primero: carga .env antes de que otros módulos lean process.env
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Rutas
import authRoutes from './routes/auth.routes';
import categoryRoutes from './routes/categories.routes';
import productRoutes  from './routes/products.routes';

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173' },
});

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// ── API Routes ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products',   productRoutes);
// app.use('/api/orders',     orderRoutes);
// app.use('/api/tables',     tableRoutes);
// app.use('/api/payments',   paymentRoutes);
// app.use('/api/deliveries', deliveryRoutes);
// app.use('/api/employees',  employeeRoutes);
// app.use('/api/expenses',   expenseRoutes);
// app.use('/api/reports',    reportRoutes);

app.get('/health', (_, res) =>
  res.json({ status: 'ok', app: 'Luis Coffee Break POS ☕' })
);

io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);
  socket.on('disconnect', () => console.log('❌ Desconectado:', socket.id));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`);
});