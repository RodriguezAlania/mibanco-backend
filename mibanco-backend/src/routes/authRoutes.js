const express = require('express');
const router = express.Router();
const { login, perfil } = require('../controllers/authController');
const verificarToken = require('../middlewares/auth');

router.post('/login', login);
router.get('/perfil', verificarToken, perfil);

module.exports = router;