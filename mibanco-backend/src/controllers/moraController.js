const pool = require('../supabase');

// Clasifica los días de atraso en banda de mora
function clasificarBanda(dias) {
  if (dias <= 0)   return 'Vigente';
  if (dias <= 30)  return 'Preventiva';
  if (dias <= 60)  return 'Temprana';
  if (dias <= 120) return 'Tardía';
  if (dias <= 180) return 'Judicial';
  return 'Castigo';
}

// GET /api/mora/cartera
// Consulta por bandas con KPIs (R1)
const consultarCartera = async (req, res) => {
  try {
    const { banda } = req.query; // filtro opcional

    const result = await pool.query(`
      SELECT 
        f.pkcuentacredito,
        f.pkcliente,
        dc.nomcliente,
        dc.numerodocumentoidentidad AS dni,
        f.diasatrasocredito,
        f.montosaldovencido,
        f.montosaldocapital,
        f.montomoraprogramada,
        f.flagjudicial,
        f.flagcastigado,
        f.fechaingresojudicial,
        f.pkasesor,
        e.desestadocredito
      FROM fagcuentacredito f
      JOIN dcliente dc ON dc.pkcliente = f.pkcliente
      JOIN destadocredito e ON e.pkestadocredito = f.pkestadocredito
      WHERE f.diasatrasocredito > 0
      ORDER BY f.diasatrasocredito DESC
    `);

    // Clasificar cada registro en su banda
    const cartera = result.rows.map(row => ({
      ...row,
      banda: clasificarBanda(row.diasatrasocredito)
    }));

    // Filtrar por banda si se especificó
    const carteraFiltrada = banda
      ? cartera.filter(c => c.banda === banda)
      : cartera;

    // Calcular KPIs por banda
    const bandas = ['Preventiva', 'Temprana', 'Tardía', 'Judicial', 'Castigo'];
    const kpis = bandas.map(b => {
      const items = cartera.filter(c => c.banda === b);
      const montoTotal = items.reduce((acc, c) => acc + parseFloat(c.montosaldovencido || 0), 0);
      return {
        banda: b,
        cantidad: items.length,
        montoTotal: montoTotal.toFixed(2)
      };
    });

    const kpiGeneral = {
      totalCreditosEnMora: cartera.length,
      montoTotalEnMora: cartera.reduce((acc, c) => acc + parseFloat(c.montosaldovencido || 0), 0).toFixed(2)
    };

    return res.json({
      kpis,
      kpiGeneral,
      cartera: carteraFiltrada
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ mensaje: 'Error al consultar la cartera de mora.' });
  }
};

// POST /api/mora/gestion
// Registrar una nueva gestión de cobranza (R2)
const registrarGestion = async (req, res) => {
  try {
    const { pkcuentacredito, diasatrasoalmomento, resultado, compromisopago, montocomprometido, pktipogestion } = req.body;
    const gestor = (req.usuario?.nombre || 'Sistema').substring(0, 20);

    if (!pkcuentacredito || !resultado)
      return res.status(400).json({ mensaje: 'Cuenta de crédito y resultado son requeridos.' });

    const banda = clasificarBanda(Number(diasatrasoalmomento) || 0);

    const result = await pool.query(
      `INSERT INTO fgestioncobranza
        (pkcuentacredito, pktipogestion, fechagestion, diasatrasoalmomento, banda, gestor, resultado, compromisopago, montocomprometido)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        pkcuentacredito,
        pktipogestion || null,
        diasatrasoalmomento || 0,
        banda,
        gestor,
        resultado,
        compromisopago || null,
        montocomprometido || null
      ]
    );

    return res.status(201).json({
      mensaje: 'Gestión de cobranza registrada.',
      gestion: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ mensaje: 'Error al registrar la gestión.' });
  }
};

// GET /api/mora/gestiones/:pkcuentacredito
// Historial de gestiones de una cuenta (R2)
const historialGestiones = async (req, res) => {
  try {
    const { pkcuentacredito } = req.params;

    const result = await pool.query(
      `SELECT g.*, t.destipogestion
       FROM fgestioncobranza g
       LEFT JOIN dtipogestioncobranza t ON t.pktipogestion = g.pktipogestion
       WHERE g.pkcuentacredito = $1
       ORDER BY g.fechagestion DESC`,
      [pkcuentacredito]
    );

    return res.json(result.rows);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ mensaje: 'Error al obtener el historial de gestiones.' });
  }
};


// PATCH /api/mora/transicion/:pkcuentacredito
// Transición a Judicial o Castigo (R3)
const transicionarEstado = async (req, res) => {
  try {
    const { pkcuentacredito } = req.params;
    const { accion } = req.body; // 'judicial' o 'castigo'
    const rol = req.usuario?.rol;

    if (!['judicial', 'castigo'].includes(accion))
      return res.status(400).json({ mensaje: 'Acción inválida. Usa: judicial o castigo.' });

    const check = await pool.query(
      `SELECT * FROM fagcuentacredito WHERE pkcuentacredito = $1`,
      [pkcuentacredito]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ mensaje: 'Cuenta de crédito no encontrada.' });

    const cuenta = check.rows[0];
    const dias = cuenta.diasatrasocredito;

    if (accion === 'judicial') {
      if (dias < 121)
        return res.status(409).json({ mensaje: `No cumple el umbral. Requiere ≥121 días de atraso (actual: ${dias}).` });
      if (cuenta.flagjudicial === 'S')
        return res.status(409).json({ mensaje: 'Esta cuenta ya está en estado Judicial.' });
      if (!['riesgos', 'gerencia', 'administrador'].includes(rol))
        return res.status(403).json({ mensaje: 'Solo riesgos, administrador o gerencia pueden derivar a judicial.' });

      const result = await pool.query(
        `UPDATE fagcuentacredito
         SET flagjudicial = 'S', fechaingresojudicial = NOW(), pkestadocredito = (
           SELECT pkestadocredito FROM destadocredito WHERE codestadocredito = '03'
         )
         WHERE pkcuentacredito = $1 RETURNING *`,
        [pkcuentacredito]
      );

      return res.json({ mensaje: 'Cuenta derivada a Judicial.', cuenta: result.rows[0] });
    }

    if (accion === 'castigo') {
      if (dias <= 180)
        return res.status(409).json({ mensaje: `No cumple el umbral. Requiere >180 días de atraso (actual: ${dias}).` });
      if (cuenta.flagcastigado === 'S')
        return res.status(409).json({ mensaje: 'Esta cuenta ya está Castigada.' });
      if (!['riesgos', 'gerencia'].includes(rol))
        return res.status(403).json({ mensaje: 'Solo riesgos o gerencia pueden castigar una cuenta.' });

      const result = await pool.query(
        `UPDATE fagcuentacredito
         SET flagcastigado = 'S', pkestadocredito = (
           SELECT pkestadocredito FROM destadocredito WHERE codestadocredito = '07'
         )
         WHERE pkcuentacredito = $1 RETURNING *`,
        [pkcuentacredito]
      );

      return res.json({ mensaje: 'Cuenta marcada como Castigada.', cuenta: result.rows[0] });
    }

  } catch (err) {
    console.error(err);
    return res.status(500).json({ mensaje: 'Error al procesar la transición.' });
  }
};

module.exports = { consultarCartera, clasificarBanda, registrarGestion, historialGestiones, transicionarEstado };
