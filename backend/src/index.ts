import 'dotenv/config'; // primero: carga .env antes de que otros módulos lean process.env
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initSocket } from './services/socket.service';

// Rutas
import authRoutes from './routes/auth.routes';
import categoryRoutes from './routes/categories.routes';
import productRoutes  from './routes/products.routes';
import orderRoutes    from './routes/orders.routes';
import tableRoutes    from './routes/tables.routes';
import reportRoutes   from './routes/reports.routes';
import expenseRoutes  from './routes/expenses.routes';

const app = express();
const httpServer = createServer(app);

// Socket.io con autenticación JWT en el handshake (ver services/socket.service.ts)
export const io = initSocket(httpServer);

// exposedHeaders: el frontend lee el nombre del .xlsx desde Content-Disposition (petición cross-origin)
app.use(cors({ origin: process.env.FRONTEND_URL, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());

// ── API Routes ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products',   productRoutes);
app.use('/api/orders',     orderRoutes);
app.use('/api/tables',     tableRoutes);
// app.use('/api/payments',   paymentRoutes);
// app.use('/api/deliveries', deliveryRoutes);
// app.use('/api/employees',  employeeRoutes);
app.use('/api/expenses',   expenseRoutes);
app.use('/api/reports',    reportRoutes);

app.get('/health', (_, res) =>
  res.json({ status: 'ok', app: 'Luis Coffee Break POS ☕' })
);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`);
});
