const express = require('express');
const router  = express.Router();
const { loginCore, listarSolicitudes, resolverSolicitud } = require('../controllers/coreController');
const verificarToken = require('../middlewares/auth');
const { verificarRol } = require('../middlewares/roles');

router.post('/login', loginCore);

router.get('/dashboard', verificarToken, verificarRol('asesor','administrador','riesgos','comite','gerencia','analista'), (req, res) => {
  res.json({
    mensaje: `Bienvenido al Core, ${req.usuario.nombre}`,
    rol: req.usuario.rol,
    cargo: req.usuario.cargo
  });
});

router.get('/solicitudes', verificarToken, verificarRol('asesor','administrador','riesgos','analista','comite','gerencia'), listarSolicitudes);
router.patch('/solicitudes/:id/resolver', verificarToken, verificarRol('asesor','administrador','jefe_regional','riesgos','comite','gerencia'), resolverSolicitud);

module.exports = router;