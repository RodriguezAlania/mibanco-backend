const express = require('express');
const router = express.Router();
const { misCuentasAhorro, misCuentasCredito, misMovimientos } = require('../controllers/cuentasController');
const verificarToken = require('../middlewares/auth');

router.get('/ahorro', verificarToken, misCuentasAhorro);
router.get('/credito', verificarToken, misCuentasCredito);
router.get('/movimientos', verificarToken, misMovimientos);

module.exports = router;