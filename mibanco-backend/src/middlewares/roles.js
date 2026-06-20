const PERMISOS = {
  'crear_solicitud':     ['asesor', 'administrador'],
  'evaluar_solicitud':   ['riesgos', 'analista'],
  'aprobar_solicitud':   ['administrador', 'jefe_regional', 'comite', 'gerencia'],
  'consultar_mora':      ['asesor', 'administrador', 'riesgos', 'gerencia', 'analista'],
  'gestionar_cobranza':  ['asesor', 'administrador'],
  'derivar_judicial':    ['administrador', 'gerencia'],
  'castigar_credito':    ['comite', 'gerencia'],
};

const verificarRol = (...rolesPermitidos) => {
  return (req, res, next) => {
    const rol = req.usuario?.rol;
    if (!rol || !rolesPermitidos.includes(rol)) {
      return res.status(403).json({
        mensaje: `Acceso denegado. Se requiere uno de estos roles: ${rolesPermitidos.join(', ')}`
      });
    }
    next();
  };
};

const puede = (accion) => {
  return (req, res, next) => {
    const rol = req.usuario?.rol;
    const permitidos = PERMISOS[accion] || [];
    if (!rol || !permitidos.includes(rol)) {
      return res.status(403).json({
        mensaje: `No tienes permiso para: ${accion}`
      });
    }
    next();
  };
};

module.exports = { verificarRol, puede };