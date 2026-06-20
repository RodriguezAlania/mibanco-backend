const pool = require('../supabase');

// CUENTAS DE AHORRO
const misCuentasAhorro = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ca.codcuentaahorro, ca.nomcuentaahorro,
              fa.saldocontable, fa.saldodisponible,
              m.simbolo AS moneda, ca.fecapertura, ca.flagactivo
       FROM dcuentaahorro ca
       JOIN fcuentaahorro fa ON fa.pkcuentaahorro = ca.pkcuentaahorro
       JOIN dmoneda m ON m.pkmoneda = ca.pkmoneda
       WHERE ca.pkcliente = $1
       ORDER BY ca.fecapertura DESC`,
      [req.usuario.pkcliente]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener cuentas de ahorro' });
  }
};

// CUENTAS DE CRÉDITO
const misCuentasCredito = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT cc.codcuentacredito, cc.fecdesembolso,
              fag.saldocapital, fag.montocuota,
              m.simbolo AS moneda, cc.flagactivo
       FROM dcuentacredito cc
       JOIN fagcuentacredito fag ON fag.pkcuentacredito = cc.pkcuentacredito
       JOIN dmoneda m ON m.pkmoneda = cc.pkmoneda
       WHERE cc.pkcliente = $1
       ORDER BY cc.fecdesembolso DESC`,
      [req.usuario.pkcliente]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener créditos' });
  }
};

// MOVIMIENTOS
const misMovimientos = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.codkardex, o.fecoperacion,
              tc.destipoperacion, co.desconceptooperacion,
              o.montooperacion, o.codtipoegresoingreso,
              m.simbolo AS moneda
       FROM foperaciones o
       JOIN dtipooperacion tc ON tc.pktipooperacion = o.pktipooperacion
       JOIN dconceptooperacion co ON co.pkconceptooperacion = o.pkconceptooperacion
       JOIN dmoneda m ON m.pkmoneda = o.pkmoneda
       JOIN dcuentaahorro ca ON ca.pkcuentaahorro = o.pkcuentaahorro
       WHERE ca.pkcliente = $1
       ORDER BY o.fecoperacion DESC
       LIMIT 50`,
      [req.usuario.pkcliente]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener movimientos' });
  }
};

module.exports = { misCuentasAhorro, misCuentasCredito, misMovimientos };