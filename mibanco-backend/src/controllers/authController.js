const pool = require('../supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// LOGIN
const login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ mensaje: 'Usuario y contraseña requeridos' });

  try {
    const result = await pool.query(
      `SELECT u.pkusuario, u.username, u.password_hash, u.pkcliente,
              u.activo, u.bloqueado,
              c.nomcliente, c.codcliente, c.numerodocumentoidentidad
       FROM usuarios_homebanking u
       JOIN dcliente c ON c.pkcliente = u.pkcliente
       WHERE u.username = $1`,
      [username]
    );

    if (result.rows.length === 0)
      return res.status(401).json({ mensaje: 'Usuario no encontrado' });

    const user = result.rows[0];

    if (user.activo !== 'S')
      return res.status(403).json({ mensaje: 'Usuario inactivo' });
    if (user.bloqueado === 'S')
      return res.status(403).json({ mensaje: 'Usuario bloqueado' });

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk)
      return res.status(401).json({ mensaje: 'Contraseña incorrecta' });

    // Actualizar último acceso
    await pool.query(
      `UPDATE usuarios_homebanking SET ultimo_acceso = NOW() WHERE pkusuario = $1`,
      [user.pkusuario]
    );

    const token = jwt.sign(
      {
        pkusuario: user.pkusuario,
        pkcliente: user.pkcliente,
        codcliente: user.codcliente.trim(),
        nombre: user.nomcliente,
        tipo: 'cliente'
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      usuario: {
        pkcliente: user.pkcliente,
        codcliente: user.codcliente.trim(),
        nombre: user.nomcliente,
        first_name: user.nomcliente,
        username: user.username,
        dni: user.numerodocumentoidentidad
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al iniciar sesión' });
  }
};

// PERFIL
const perfil = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.codcliente, c.nomcliente, c.fecnacimiento,
              c.numerodocumentoidentidad, c.celular, c.correo
       FROM dcliente c
       WHERE c.pkcliente = $1`,
      [req.usuario.pkcliente]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener perfil' });
  }
};

module.exports = { login, perfil };