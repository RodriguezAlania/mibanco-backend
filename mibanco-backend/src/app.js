const express = require('express');
const cors = require('cors');

require('dotenv').config();

const authRoutes     = require('./routes/authRoutes');
const cuentasRoutes  = require('./routes/cuentasRoutes');
const coreRoutes     = require('./routes/coreRoutes');
const creditosRoutes = require('./routes/creditosRoutes');


const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

// Rutas
app.use('/api/auth',     authRoutes);
app.use('/api/cuentas',  cuentasRoutes);
app.use('/api/core',     coreRoutes);
app.use('/api/creditos', creditosRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ mensaje: 'MiBanco API corriendo ✅' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

const moraRoutes = require('./routes/moraRoutes');
app.use('/api/mora', moraRoutes);
