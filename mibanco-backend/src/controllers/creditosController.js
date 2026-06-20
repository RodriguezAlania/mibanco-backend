const pool = require('../supabase');

function calcularScore() {
  return Math.floor(Math.random() * 451) + 400;
}

function calcularTEA(conSeguro) {
  return conSeguro === 'S' ? 40.92 : 43.92;
}

function validarReglas(monto, plazo, moneda) {
  if (moneda === 'PEN') {
    if (monto < 300)             return 'El monto mínimo permitido es S/300.';
    if (plazo < 1 || plazo > 24) return 'El plazo permitido es de 1 a 24 meses.';
  } else {
    if (monto < 100)             return 'El monto mínimo permitido es US$100.';
    if (plazo < 1 || plazo > 12) return 'El plazo permitido es de 1 a 12 meses.';
  }
  return null;
}

function determinarEstado(score, monto, moneda) {
  if (score < 500)
    return { estado: 'Rechazado', motivo: 'Riesgo crediticio alto.' };
  const montoRef = moneda === 'USD' ? monto * 3.7 : monto;
  if (montoRef <= 5000)  return { estado: 'Aprobado',     motivo: null };
  if (montoRef <= 20000) return { estado: 'En Revision',  motivo: 'Requiere aprobación del asesor.' };
  return                        { estado: 'En Revision',  motivo: 'Requiere aprobación del jefe de créditos.' };
}

const solicitarCredito = async (req, res) => {
  try {
    const { monto, moneda, plazo, con_seguro, fecha_desembolso_real, dia_pago } = req.body;
    const cliente_id = req.usuario?.pkcliente;

    if (!cliente_id)
      return res.status(401).json({ mensaje: 'No se identificó al cliente.' });

    if (!monto || !moneda || !plazo)
      return res.status(400).json({ mensaje: 'Monto, moneda y plazo son requeridos.' });

    const errorRegla = validarReglas(Number(monto), Number(plazo), moneda);
    if (errorRegla)
      return res.status(422).json({ mensaje: errorRegla });

    const seguro = con_seguro === 'S' ? 'S' : 'N';
    const score = calcularScore();
    const tea   = calcularTEA(seguro);
    const { estado, motivo } = determinarEstado(score, Number(monto), moneda);

    const result = await pool.query(
      `INSERT INTO solicitudes_credito
        (cliente_id, producto, moneda, monto, plazo, score_crediticio, tea, estado, motivo_rechazo, con_seguro, fecha_desembolso_real, dia_pago)
       VALUES ($1, 'Capital de Trabajo', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        cliente_id, moneda, monto, plazo, score, tea, estado, motivo,
        seguro,
        fecha_desembolso_real || null,
        dia_pago || null
      ]
    );

    return res.status(201).json({
      mensaje: `Solicitud registrada. Estado: ${estado}`,
      solicitud: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ mensaje: 'Error al registrar la solicitud.' });
  }
};


const misSolicitudes = async (req, res) => {
console.log('misSolicitudes llamado, usuario:', req.usuario);
  try {
    const cliente_id = req.usuario?.pkcliente;
    if (!cliente_id) return res.status(401).json({ mensaje: 'No se identificó al cliente.' });
    const result = await pool.query(
      `SELECT * FROM solicitudes_credito WHERE cliente_id = $1 ORDER BY fecha_solicitud DESC`,
      [cliente_id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ mensaje: 'Error al obtener solicitudes.' });
  }
};

const cronograma = async (req, res) => {
  try {
    const { id } = req.params;
    const cliente_id = req.usuario?.pkcliente;

    const result = await pool.query(
      `SELECT * FROM solicitudes_credito WHERE id = $1 AND cliente_id = $2`,
      [id, cliente_id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ mensaje: 'Solicitud no encontrada.' });

    const s = result.rows[0];

    if (s.estado !== 'Aprobado' && s.estado !== 'Desembolsado')
      return res.status(400).json({ mensaje: 'El crédito aún no está aprobado.' });

    const tea   = parseFloat(s.tea) / 100;
    const tem   = Math.pow(1 + tea, 1 / 12) - 1;
    const n     = s.plazo;
    const pv    = parseFloat(s.monto);
    const cuota = tem === 0 ? pv / n : (pv * tem) / (1 - Math.pow(1 + tem, -n));

    // Fecha base: usa fecha_desembolso_real si existe, si no usa fecha_solicitud
    const fechaBase = s.fecha_desembolso_real
      ? new Date(s.fecha_desembolso_real)
      : new Date(s.fecha_solicitud);

    // Día de pago fijo: usa dia_pago si existe, si no usa el día de la fecha base
    const diaPago = s.dia_pago || fechaBase.getDate();

    const cuotas = [];
    let saldo = pv;

    for (let i = 1; i <= n; i++) {
      const interes = saldo * tem;
      const amort   = cuota - interes;
      saldo         = saldo - amort;

      // Primera cuota: 1 mes después de la fecha base, con el día de pago fijo
      const fechaPago = new Date(fechaBase.getFullYear(), fechaBase.getMonth() + i, diaPago);

      cuotas.push({
        nro:     i,
        fecha:   fechaPago.toISOString().split('T')[0],
        cuota:   cuota.toFixed(2),
        interes: interes.toFixed(2),
        amort:   amort.toFixed(2),
        saldo:   Math.max(saldo, 0).toFixed(2)
      });
    }

    return res.json({ solicitud: s, cronograma: cuotas });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ mensaje: 'Error al generar cronograma.' });
  }
};

module.exports = { solicitarCredito, misSolicitudes, cronograma };