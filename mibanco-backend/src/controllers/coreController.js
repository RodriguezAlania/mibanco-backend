const pool = require('../supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const CARGO_A_ROL = {
  'G01': 'gerencia',
  'G02': 'gerencia',
  'F01': 'jefe_regional',
  'F02': 'administrador',
  'F03': 'operaciones',
  'F04': 'riesgos',
  'F05': 'comite',
  'E01': 'asesor',
  'E02': 'operaciones',
  'E03': 'analista',
  'E04': 'operaciones',
};

const loginCore = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ mensaje: 'Usuario y contraseña requeridos' });

  try {
        const result = await pool.query(
    `SELECT uc.pkusuario_core, uc.username, uc.password_hash, uc.activo,
            p.pkpersonal, p.nombre, p.numerodni,
            cp.codcargopersonal, cp.descargopersonal,
            pa.pkasesor
    FROM usuarios_core uc
    JOIN dpersonal p ON p.pkpersonal = uc.pkpersonal
    JOIN dpersonalcargo pc ON pc.pkpersonal = p.pkpersonal
    JOIN dcargopersonal cp ON cp.pkcargopersonal = pc.pkcargopersonal
    LEFT JOIN dpersonalasesor pa ON pa.pkpersonal = p.pkpersonal
    WHERE uc.username = $1`,
    [username]
    );

    if (result.rows.length === 0)
      return res.status(401).json({ mensaje: 'Usuario no encontrado' });

    const user = result.rows[0];

    if (user.activo !== 'S')
      return res.status(403).json({ mensaje: 'Usuario inactivo' });

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk)
      return res.status(401).json({ mensaje: 'Contraseña incorrecta' });

    await pool.query(
      `UPDATE usuarios_core SET ultimo_acceso = NOW() WHERE pkusuario_core = $1`,
      [user.pkusuario_core]
    );

    const rol = CARGO_A_ROL[user.codcargopersonal?.trim()] || 'asesor';
    const nombre = user.nombre;

    const token = jwt.sign(
      {
        pkpersonal: user.pkpersonal,
        pkasesor: user.pkasesor,
        username: user.username,
        nombre,
        rol,
        cargo: user.descargopersonal,
        tipo: 'personal'
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      usuario: { nombre, rol, cargo: user.descargopersonal }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al iniciar sesión en el Core' });
  }
};

// GET /api/core/solicitudes
const listarSolicitudes = async (req, res) => {
  const { estado } = req.query; // filtro opcional: ?estado=Pendiente

  try {
    let query = `
      SELECT sc.*, 
             dc.nomcliente AS nombre_cliente,
             dc.numerodocumentoidentidad AS dni_cliente
      FROM solicitudes_credito sc
      JOIN dcliente dc ON dc.pkcliente = sc.cliente_id
    `;
    const params = [];

    if (estado) {
      query += ` WHERE sc.estado = $1`;
      params.push(estado);
    }

    query += ` ORDER BY sc.fecha_solicitud DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al listar solicitudes.' });
  }
};

// PATCH /api/core/solicitudes/:id/resolver
const resolverSolicitud = async (req, res) => {
  const { id } = req.params;
  const { accion, motivo_rechazo } = req.body;
  const aprobado_por = req.usuario?.pkusuario_core;

  // accion debe ser: 'aprobar', 'rechazar' o 'desembolsar'
  if (!['aprobar', 'rechazar', 'desembolsar'].includes(accion))
    return res.status(400).json({ mensaje: 'Acción inválida. Usa: aprobar, rechazar o desembolsar.' });

  try {
    // Verificar que existe
    const check = await pool.query(
      `SELECT * FROM solicitudes_credito WHERE id = $1`,
      [id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ mensaje: 'Solicitud no encontrada.' });

    const solicitud = check.rows[0];

    // Validar transiciones de estado
    if (accion === 'aprobar' && solicitud.estado !== 'En Revision')
      return res.status(409).json({ mensaje: `Solo se pueden aprobar solicitudes En Revision. Estado actual: ${solicitud.estado}` });

    if (accion === 'rechazar' && !['Pendiente', 'En Revision'].includes(solicitud.estado))
      return res.status(409).json({ mensaje: 'Solo se pueden rechazar solicitudes Pendientes o En Revision.' });

    if (accion === 'desembolsar' && solicitud.estado !== 'Aprobado')
      return res.status(409).json({ mensaje: 'Solo se pueden desembolsar solicitudes Aprobadas.' });

    // Validar permisos por monto (ruta de aprobación)
    if (accion === 'aprobar') {
      const rol = req.usuario?.rol;
      const monto = parseFloat(solicitud.monto);
      const montoRef = solicitud.moneda === 'USD' ? monto * 3.7 : monto;

      if (montoRef > 20000 && !['comite', 'gerencia'].includes(rol))
        return res.status(403).json({ mensaje: 'Montos mayores a S/20,000 requieren aprobación de comité o gerencia.' });

      if (montoRef > 5000 && montoRef <= 20000 && !['administrador', 'jefe_regional', 'comite', 'gerencia'].includes(rol))
        return res.status(403).json({ mensaje: 'Montos entre S/5,000 y S/20,000 requieren aprobación del administrador o jefe regional.' });
    }

    // Construir update según acción
    let updateQuery, updateParams;

    if (accion === 'aprobar') {
      updateQuery = `
        UPDATE solicitudes_credito
        SET estado = 'Aprobado', fecha_aprobacion = NOW(), aprobado_por = $1
        WHERE id = $2 RETURNING *`;
      updateParams = [aprobado_por, id];

    } else if (accion === 'rechazar') {
      updateQuery = `
        UPDATE solicitudes_credito
        SET estado = 'Rechazado', motivo_rechazo = $1, aprobado_por = $2
        WHERE id = $3 RETURNING *`;
      updateParams = [motivo_rechazo || 'Rechazado por el evaluador.', aprobado_por, id];

    } else { // desembolsar
      updateQuery = `
        UPDATE solicitudes_credito
        SET estado = 'Desembolsado', fecha_desembolso = NOW(), aprobado_por = $1
        WHERE id = $2 RETURNING *`;
      updateParams = [aprobado_por, id];
    }

    const result = await pool.query(updateQuery, updateParams);
    res.json({
      mensaje: `Solicitud ${accion === 'aprobar' ? 'aprobada' : accion === 'rechazar' ? 'rechazada' : 'desembolsada'} correctamente.`,
      solicitud: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al resolver la solicitud.' });
  }
};


module.exports = { loginCore, listarSolicitudes, resolverSolicitud };