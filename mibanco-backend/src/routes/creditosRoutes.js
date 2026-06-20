const express = require('express');
const router  = express.Router();
const verificarToken = require('../middlewares/auth');
const { solicitarCredito, misSolicitudes, cronograma } = require('../controllers/creditosController');

router.post('/solicitar',      verificarToken, solicitarCredito);
router.get('/mis-solicitudes', verificarToken, misSolicitudes);
router.get('/cronograma/:id',  verificarToken, cronograma);

module.exports = router;