const express = require('express');
const router  = express.Router();
const verificarToken = require('../middlewares/auth');
const { verificarRol } = require('../middlewares/roles');
const { consultarCartera, registrarGestion, historialGestiones, transicionarEstado } = require('../controllers/moraController');

router.patch(
  '/transicion/:pkcuentacredito',
  verificarToken,
  verificarRol('riesgos', 'gerencia', 'administrador'),
  transicionarEstado
);

router.get(
  '/cartera',
  verificarToken,
  verificarRol('asesor', 'administrador', 'riesgos', 'gerencia', 'analista'),
  consultarCartera
);

router.post(
  '/gestion',
  verificarToken,
  verificarRol('asesor', 'administrador'),
  registrarGestion
);

router.get(
  '/gestiones/:pkcuentacredito',
  verificarToken,
  verificarRol('asesor', 'administrador', 'riesgos', 'gerencia', 'analista'),
  historialGestiones
);


module.exports = router;