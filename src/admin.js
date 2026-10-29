import { db } from './firebase.js';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDoc, updateDoc, addDoc, writeBatch, deleteField } from 'firebase/firestore';
import {
  escaparHtml,
  miniaturaImagenHTML,
  comprimirImagenProducto,
  validarTamanoFotosProducto
} from './product-images.js';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

const contenedorPantallas = document.getElementById('contenedor-pantallas');
const btnEstadisticas = document.getElementById('btn-estadisticas');
const btnRoles = document.getElementById('btn-roles');
const btnSeguridad = document.getElementById('btn-seguridad');
const btnAbonos = document.getElementById('btn-abonos');

const btnPrincipal = document.getElementById('btn-principal');
const btnMembresias = document.getElementById('btn-membresias');
const btnDinamicas = document.getElementById('btn-dinamicas');
const modalAccesoAdmin = document.getElementById('modal-acceso-admin');
const modalAdminInput = document.getElementById('admin-password-input');
const modalAdminError = document.getElementById('admin-password-error');
const modalAdminSubmit = document.getElementById('admin-password-submit');
const modalAdminCancel = document.getElementById('admin-password-cancel');
const modalAdminClose = document.getElementById('admin-password-close');
const modalAdminForgot = document.getElementById('admin-password-forgot');

let productosVentaRapidaAdmin = [];
let datosSeguridadLocal = null;
let preciosServiciosLocal = { membresia: 450, visita: 35, caminadora: 20 };
let accesoConcedidoAdmin = false;
let filtroTemporalActual = 'hoy';
let ventasCacheGlobalAdmin = [];
let desuscribirVentasAdmin = null;
let chartLineaAdmin = null;
let chartDonaAdmin = null;
let pendingAdminAction = null;
let pendingAdminButton = null;
const refServiciosPrecios = doc(db, 'configuracion', 'preciosServicios');
const MENSAJE_ERROR_ADMIN = 'Error al procesar la solicitud. Verifica tu conexión e intenta de nuevo.';

function mensajeErrorProducto(error) {
  switch (error?.code) {
    case 'image/too-large':
      return error.message;
    case 'image/product-too-large':
      return error.message;
    case 'unavailable':
      return 'Firestore no está disponible. Verifica tu conexión e intenta de nuevo.';
    default:
      return MENSAJE_ERROR_ADMIN;
  }
}

function mostrarToastAdmin(texto, variante = 'info') {
  if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje(texto, variante, 3000);
}

function abrirModalAdmin({ mensaje, titulo = '', aceptar = 'Aceptar', cancelar = 'Cancelar', tipoEntrada = false, valorInicial = '' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4';
    overlay.innerHTML = `
      <div class="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
        ${titulo ? `<h3 class="mb-2 text-lg font-black text-zinc-900">${titulo}</h3>` : ''}
        <p class="mb-4 text-sm text-zinc-600">${mensaje}</p>
        ${tipoEntrada ? '<input type="text" class="modal-admin-entry w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-red-500" />' : ''}
        <div class="mt-5 flex gap-3">
          <button type="button" data-modal-cancel class="flex-1 rounded-xl bg-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-800 hover:bg-zinc-300">${cancelar}</button>
          <button type="button" data-modal-accept class="flex-1 rounded-xl bg-[#D32F2F] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">${aceptar}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const entrada = overlay.querySelector('.modal-admin-entry');
    if (entrada) {
      entrada.value = valorInicial;
      entrada.focus();
    }
    const cerrar = (resultado) => {
      document.removeEventListener('keydown', manejarEscape);
      overlay.remove();
      resolve(resultado);
    };
    const manejarEscape = (event) => {
      if (event.key === 'Escape') cerrar(null);
    };
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) cerrar(null);
    });
    overlay.querySelector('[data-modal-cancel]').onclick = () => cerrar(null);
    overlay.querySelector('[data-modal-accept]').onclick = () => cerrar(entrada ? entrada.value.trim() : true);
    document.addEventListener('keydown', manejarEscape);
  });
}

async function confirmarAdmin(mensaje, titulo = 'Confirmar acción') {
  return (await abrirModalAdmin({ mensaje, titulo })) === true;
}

async function solicitarTextoAdmin(mensaje, titulo = 'Ingresa la información') {
  const resultado = await abrirModalAdmin({ mensaje, titulo, tipoEntrada: true });
  return typeof resultado === 'string' ? resultado : null;
}

function normalizarRespuestaSeguridad(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es');
}

function obtenerPreguntaSeguridad(preguntaId) {
  return {
    cumpleanios: '¿Cuál es tu fecha de nacimiento?',
    mascota: '¿Cuál fue el nombre de tu primera mascota?',
    escuela: '¿Cuál es el nombre de tu escuela primaria?',
    ciudad: '¿En qué ciudad naciste?'
  }[preguntaId] || '¿Cuál es tu fecha de nacimiento?';
}

function crearTOTP(secret) {
  return new OTPAuth.TOTP({
    issuer: 'My Fit Gym Rodeo',
    label: 'Administrador',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret
  });
}

function validarCodigoTOTP(secret, token) {
  if (!secret || !/^\d{6}$/.test(String(token || '').trim())) return false;
  return crearTOTP(secret).validate({ token: String(token).trim(), window: 1 }) !== null;
}

function solicitarDatoRecuperacion({ titulo, pregunta, tipo = 'text', placeholder = '', autocomplete = 'off', validar = null, validarEnEntrada = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
    overlay.innerHTML = `
      <form class="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
        <div>
          <h3 class="text-lg font-black text-zinc-900">${escaparHtml(titulo)}</h3>
          <p class="mt-1 text-sm text-zinc-600">${escaparHtml(pregunta)}</p>
        </div>
        <input data-recovery-input type="${tipo}" ${tipo === 'date' ? '' : `placeholder="${escaparHtml(placeholder)}"`} autocomplete="${autocomplete}" ${tipo === 'text' ? 'autocapitalize="off"' : ''} class="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-red-500">
        <p data-recovery-error class="hidden text-xs font-semibold text-red-600"></p>
        <div class="flex gap-3">
          <button type="button" data-recovery-cancel class="flex-1 rounded-xl bg-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-800">Cancelar</button>
          <button type="submit" class="flex-1 rounded-xl bg-[#D32F2F] px-4 py-2.5 text-sm font-bold text-white">Continuar</button>
        </div>
      </form>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector('form');
    const input = overlay.querySelector('[data-recovery-input]');
    const error = overlay.querySelector('[data-recovery-error]');
    const submit = form.querySelector('[type="submit"]');
    const close = (value) => {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      resolve(value);
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') close(null);
    };
    input.focus();
    if (validarEnEntrada) {
      input.inputMode = 'numeric';
      input.maxLength = 6;
      input.pattern = '[0-9]{6}';
      input.addEventListener('input', () => {
        const code = input.value.trim();
        if (!code) {
          error.textContent = '';
          error.classList.add('hidden');
          submit.disabled = true;
          return;
        }
        const esValido = validar(code);
        error.textContent = esValido ? 'Código válido.' : 'Escribe el código de 6 dígitos actual.';
        error.classList.toggle('hidden', false);
        error.classList.toggle('text-emerald-600', esValido);
        error.classList.toggle('text-red-600', !esValido);
        submit.disabled = !esValido;
      });
      submit.disabled = true;
    }
    overlay.querySelector('[data-recovery-cancel]').onclick = () => close(null);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });
    form.onsubmit = (event) => {
      event.preventDefault();
      const value = input.value;
      if (!value.trim()) {
        error.textContent = 'Completa este campo.';
        error.classList.remove('hidden');
        return;
      }
      if (validar && !validar(value)) {
        error.textContent = 'El código de verificación no es válido. Intenta de nuevo.';
        error.classList.remove('hidden');
        input.select();
        return;
      }
      close(value);
    };
    document.addEventListener('keydown', onKeydown);
  });
}

async function solicitarNuevaContrasena() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
    overlay.innerHTML = `
      <form class="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
        <div>
          <h3 class="text-lg font-black text-zinc-900">Actualizar contraseña</h3>
          <p class="mt-1 text-sm text-zinc-600">Ingresa y confirma tu nueva contraseña.</p>
        </div>
        <input data-new-password type="password" minlength="4" required autocomplete="new-password" placeholder="Nueva contraseña" class="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-red-500">
        <input data-confirm-password type="password" minlength="4" required autocomplete="new-password" placeholder="Confirmar contraseña" class="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-red-500">
        <p data-password-error class="hidden text-xs font-semibold text-red-600"></p>
        <div class="flex gap-3">
          <button type="button" data-password-cancel class="flex-1 rounded-xl bg-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-800">Cancelar</button>
          <button type="submit" class="flex-1 rounded-xl bg-[#D32F2F] px-4 py-2.5 text-sm font-bold text-white">Guardar contraseña</button>
        </div>
      </form>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector('form');
    const password = overlay.querySelector('[data-new-password]');
    const confirmation = overlay.querySelector('[data-confirm-password]');
    const error = overlay.querySelector('[data-password-error]');
    const close = (value) => {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      resolve(value);
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') close(null);
    };
    password.focus();
    overlay.querySelector('[data-password-cancel]').onclick = () => close(null);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });
    form.onsubmit = (event) => {
      event.preventDefault();
      if (password.value.length < 4) {
        error.textContent = 'La contraseña debe tener al menos 4 caracteres.';
        error.classList.remove('hidden');
        return;
      }
      if (password.value !== confirmation.value) {
        error.textContent = 'Las contraseñas no coinciden.';
        error.classList.remove('hidden');
        confirmation.focus();
        return;
      }
      close(password.value);
    };
    document.addEventListener('keydown', onKeydown);
  });
}

async function actualizarContrasenaRecuperada(password) {
  await setDoc(refCredenciales, {
    password,
    ultimaActualizacion: new Date().toISOString()
  }, { merge: true });
  datosSeguridadLocal = { ...datosSeguridadLocal, password };
}

onSnapshot(collection(db, 'productos'), (snapshot) => {
  productosVentaRapidaAdmin = [];
  snapshot.forEach((docSnap) => {
    productosVentaRapidaAdmin.push({ id: docSnap.id, ...docSnap.data() });
  });
  if (document.getElementById('tabla-productos-editables-admin')) {
    renderProductosCatalogoAdmin();
  }
});

const refCredenciales = doc(db, 'configuracion', 'credenciales');
getDoc(refCredenciales)
  .then((docSnap) => {
    datosSeguridadLocal = docSnap.exists() ? docSnap.data() : { password: 'Admin123', nacimiento: '2026-01-01' };
  })
  .catch((error) => console.error('Error cargando credenciales:', error));

getDoc(refServiciosPrecios)
  .then((docSnap) => {
    if (docSnap.exists()) {
      preciosServiciosLocal = { ...preciosServiciosLocal, ...docSnap.data() };
    }
  })
  .catch((error) => console.error('Error cargando precios de servicios:', error));

function inicializarSuscripcionVentasAdmin() {
  if (desuscribirVentasAdmin) return;

  desuscribirVentasAdmin = onSnapshot(
    collection(db, 'ventas'),
    (snapshot) => {
      ventasCacheGlobalAdmin = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data || !data.fecha) return;
        const fecha = typeof data.fecha.toDate === 'function' ? data.fecha.toDate() : new Date(data.fecha);
        ventasCacheGlobalAdmin.push({
          id: docSnap.id,
          fecha,
          monto: Number(data.monto) || 0,
          concepto: data.concepto || 'Venta Express',
          metodoPago: data.metodoPago || data.metodo || 'Efectivo',
          tipo: data.tipo || 'producto',
              productosArr: Array.isArray(data.productosArr) ? data.productosArr : [],
              estadoPago: data.estadoPago || null,
              saldoPendiente: Number(data.saldoPendiente || 0)
            });
      });
      ventasCacheGlobalAdmin.sort((a, b) => b.fecha - a.fecha);
      procesarGraficosSlicers();
    },
    (error) => {
      console.error('Error en suscripción de ventas:', error);
    }
  );
}

inicializarSuscripcionVentasAdmin();

function ajustarPerfilAdmin() {
  const nombre = document.getElementById('usuario-nombre');
  const rol = document.getElementById('usuario-rol');
  if (nombre) nombre.textContent = 'Dueño Rodeo';
  if (rol) rol.textContent = 'Administrador';
}

function abrirModalAccesoAdmin(funcionDestino, botonActivar) {
  if (!modalAccesoAdmin || !modalAdminInput) {
    verificarFiltroSeguridadAcceso(funcionDestino, botonActivar);
    return;
  }

  pendingAdminAction = funcionDestino;
  pendingAdminButton = botonActivar;
  modalAdminError?.classList.add('hidden');
  modalAdminInput.value = '';
  modalAccesoAdmin.classList.remove('hidden');
  modalAdminInput.focus();
}

function cerrarModalAccesoAdmin() {
  if (!modalAccesoAdmin) return;
  modalAccesoAdmin.classList.add('hidden');
  pendingAdminAction = null;
  pendingAdminButton = null;
}

function verificarFiltroSeguridadAcceso(funcionDestino, botonActivar) {
  ajustarPerfilAdmin();
  if (accesoConcedidoAdmin) {
    MarcarBotonYTab(botonActivar, funcionDestino);
    return;
  }

  abrirModalAccesoAdmin(funcionDestino, botonActivar);
}

function inicializarModalAccesoAdmin() {
  if (!modalAccesoAdmin || !modalAdminInput || !modalAdminError || !modalAdminSubmit || !modalAdminCancel || !modalAdminClose || !modalAdminForgot) return;

  modalAccesoAdmin.classList.add('bg-black/50', 'backdrop-blur-sm');

  modalAdminSubmit.onclick = () => {
    const claveMaestra = datosSeguridadLocal?.password || 'Admin123';
    const contraseña = modalAdminInput.value.trim();
    if (contraseña === claveMaestra) {
      accesoConcedidoAdmin = true;
      modalAdminError.classList.add('hidden');
      const accion = pendingAdminAction;
      const boton = pendingAdminButton;
      if (boton && accion) {
        MarcarBotonYTab(boton, accion);
      }
      cerrarModalAccesoAdmin();
      return;
    }
    modalAdminError.textContent = 'Contraseña incorrecta. Intenta de nuevo.';
    modalAdminError.classList.remove('hidden');
  };

  modalAdminCancel.onclick = cerrarModalAccesoAdmin;
  modalAdminClose.onclick = cerrarModalAccesoAdmin;
  modalAccesoAdmin.addEventListener('click', (event) => {
    if (event.target === modalAccesoAdmin) cerrarModalAccesoAdmin();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modalAccesoAdmin.classList.contains('hidden')) cerrarModalAccesoAdmin();
  });
  modalAdminForgot.onclick = async () => {
    try {
      const credentialSnapshot = await getDoc(refCredenciales);
      if (credentialSnapshot.exists()) datosSeguridadLocal = credentialSnapshot.data();
      const preguntaId = datosSeguridadLocal?.seguridadPreguntaId || 'cumpleanios';
      const pregunta = obtenerPreguntaSeguridad(preguntaId);
      const respuesta = await solicitarDatoRecuperacion({
        titulo: 'Recuperar contraseña',
        pregunta,
        tipo: preguntaId === 'cumpleanios' ? 'date' : 'text',
        placeholder: 'Tu respuesta',
        autocomplete: 'off'
      });
      if (respuesta === null) return;

      const respuestaGuardada = datosSeguridadLocal?.seguridadRespuesta
        || datosSeguridadLocal?.nacimiento
        || '2026-01-01';
      if (normalizarRespuestaSeguridad(respuesta) !== normalizarRespuestaSeguridad(respuestaGuardada)) {
        modalAdminError.textContent = 'La respuesta de seguridad es incorrecta.';
        modalAdminError.classList.remove('hidden');
        return;
      }

      if (datosSeguridadLocal?.autenticacion2FA === true) {
        const codigo = await solicitarDatoRecuperacion({
          titulo: 'Verificación en dos pasos',
          pregunta: 'Ingresa el código actual de 6 dígitos de tu aplicación Authenticator.',
          tipo: 'text',
          placeholder: '000000',
          autocomplete: 'one-time-code',
          validar: (value) => validarCodigoTOTP(datosSeguridadLocal?.totpSecret, value),
          validarEnEntrada: true
        });
        if (codigo === null) return;
      }

      const nuevaContrasena = await solicitarNuevaContrasena();
      if (!nuevaContrasena) return;
      await actualizarContrasenaRecuperada(nuevaContrasena);
      modalAdminError.classList.add('hidden');
      modalAdminInput.value = '';
      mostrarToastAdmin('Contraseña actualizada. Ya puedes iniciar sesión.', 'success');
    } catch (error) {
      console.error('Error en recuperación de contraseña:', error);
      modalAdminError.textContent = MENSAJE_ERROR_ADMIN;
      modalAdminError.classList.remove('hidden');
    }
  };
}

inicializarModalAccesoAdmin();

async function anularVentaAdmin(idVenta) {
  if (!(await confirmarAdmin('¿Deseas anular esta venta? Esto restablecerá el inventario si aplica.'))) return;

  try {
    const ventaSnap = await getDoc(doc(db, 'ventas', idVenta));
    const batch = writeBatch(db);
    if (ventaSnap.exists()) {
      const ventaData = ventaSnap.data();
      const productosArr = Array.isArray(ventaData.productosArr) ? ventaData.productosArr : [];
      for (const item of productosArr) {
        if (!item || !item.id) continue;
        const productoRef = doc(db, 'productos', item.id);
        const productoSnap = await getDoc(productoRef);
        if (productoSnap.exists() && productoSnap.data().tipo !== 'servicio') {
          batch.update(productoRef, { stock: Number(productoSnap.data().stock || 0) + Number(item.cantidad || 0) });
        }
      }
    }
    batch.delete(doc(db, 'ventas', idVenta));
    await batch.commit();
    mostrarToastAdmin('Venta cancelada e inventario reajustado', 'info');
  } catch (error) {
    console.error(error);
    mostrarToastAdmin(MENSAJE_ERROR_ADMIN, 'error');
  }
}

function cargarPantallaEstadisticas() {
  destruirGraficosEstructurales();
  if (!contenedorPantallas) return;

  contenedorPantallas.innerHTML = `
    <div class="space-y-6 pb-8">
      <div class="flex items-center justify-between">
        <div><h2 class="text-2xl font-black">Estadísticas de My Fit Gym Rodeo</h2><p class="text-zinc-500 text-xs">Inteligencia de caja calculada desde Firestore.</p></div>
        <div class="inline-flex p-1 bg-zinc-100 rounded-2xl border text-xs font-bold">
          <button id="slicer-hoy" class="px-3 py-1.5 rounded-xl transition-all">HOY</button>
          <button id="slicer-semana" class="px-3 py-1.5 rounded-xl transition-all">SEMANA</button>
          <button id="slicer-mes" class="px-3 py-1.5 rounded-xl transition-all">MES</button>
          <button id="slicer-anio" class="px-3 py-1.5 rounded-xl transition-all">AÑO</button>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-center">
        <div class="p-5 bg-white border rounded-3xl shadow-sm"><p class="text-[10px] font-bold text-zinc-400 uppercase">Facturación</p><h3 class="text-2xl font-black mt-1" id="kpi-ingreso-mes">$0.00</h3></div>
        <div class="p-5 bg-white border rounded-3xl shadow-sm"><p class="text-[10px] font-bold text-zinc-400 uppercase">Miembros Activos</p><h3 class="text-2xl font-black mt-1" id="kpi-miembros-activos">0</h3></div>
        <div class="p-5 bg-white border rounded-3xl shadow-sm"><p class="text-[10px] font-bold text-zinc-400 uppercase">Suplementos</p><h3 class="text-2xl font-black mt-1" id="kpi-productos-monto">$0.00</h3></div>
        <div class="p-5 bg-white border rounded-3xl shadow-sm"><p class="text-[10px] font-bold text-zinc-400 uppercase">Ticket Promedio</p><h3 class="text-2xl font-black mt-1" id="kpi-ticket-promedio">$0.00</h3></div>
        <div class="p-5 bg-white border rounded-3xl shadow-sm"><p class="text-[10px] font-bold text-zinc-400 uppercase">MONTO CUENTAS POR COBRAR</p><h3 class="text-2xl font-black mt-1" id="kpi-cuentas-por-cobrar">$0.00</h3></div>
        <div class="p-5 bg-white border rounded-3xl shadow-sm"><p class="text-[10px] font-bold text-zinc-400 uppercase">TOTAL EFECTIVO</p><h3 class="text-2xl font-black mt-1" id="kpi-total-efectivo">$0.00</h3></div>
        <div class="p-5 bg-white border rounded-3xl shadow-sm"><p class="text-[10px] font-bold text-zinc-400 uppercase">TOTAL TARJETA</p><h3 class="text-2xl font-black mt-1" id="kpi-total-tarjeta">$0.00</h3></div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 p-5 bg-white border rounded-3xl h-[280px] relative flex items-center justify-center"><canvas id="chart-linea-ingresos"></canvas></div>
        <div class="p-5 bg-white border rounded-3xl h-[280px] relative flex items-center justify-center"><canvas id="chart-dona-mix"></canvas></div>
      </div>

      <div class="bg-white border rounded-3xl p-5 shadow-sm space-y-6">
        <div>
          <div class="flex items-center justify-between gap-3 mb-3">
            <h3 class="text-sm font-bold text-zinc-900 uppercase" id="titulo-tabla-operaciones-admin">Operaciones del Periodo</h3>
            <input id="buscador-operaciones-periodo-admin" type="search" placeholder="Buscar operación..." class="w-56 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] outline-none focus:border-red-500">
          </div>
          <div class="overflow-x-auto max-h-[280px] overflow-y-auto">
            <table class="w-full text-left text-xs">
              <thead class="text-zinc-400 uppercase border-b">
                <tr>
                  <th class="pb-2">Fecha/Hora</th>
                  <th class="pb-2">Concepto Detallado</th>
                  <th class="pb-2">Categoría</th>
                  <th class="pb-2 text-center">Método</th>
                  <th class="pb-2 text-right">Monto</th>
                  <th class="pb-2 text-right text-red-500">Acción</th>
                </tr>
              </thead>
              <tbody id="tabla-dashboard-ventas-admin"></tbody>
            </table>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between gap-3 mb-3">
            <h3 class="text-sm font-bold text-zinc-900 uppercase">Ventas del Mes</h3>
            <input id="buscador-ventas-mes-admin" type="search" placeholder="Buscar venta del mes..." class="w-56 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] outline-none focus:border-red-500">
          </div>
          <div class="overflow-x-auto max-h-[280px] overflow-y-auto">
            <table class="w-full text-left text-xs">
              <thead class="text-zinc-400 uppercase border-b">
                <tr>
                  <th class="pb-2">Fecha/Hora</th>
                  <th class="pb-2">Concepto</th>
                  <th class="pb-2">Categoría</th>
                  <th class="pb-2 text-center">Método</th>
                  <th class="pb-2 text-right">Monto</th>
                  <th class="pb-2 text-right text-red-500">Acción</th>
                </tr>
              </thead>
              <tbody id="tabla-ventas-mes-admin"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  const configurarSlicer = (id, periodo) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.onclick = () => {
      filtroTemporalActual = periodo;
      setActiveSlicer(periodo);
      procesarGraficosSlicers();
    };
  };

  function setActiveSlicer(periodo) {
    ['slicer-hoy','slicer-semana','slicer-mes','slicer-anio'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = 'px-3 py-1.5 rounded-xl transition-all';
    });
    const sel = document.getElementById('slicer-' + periodo);
    if (sel) sel.className = 'px-3 py-1.5 rounded-xl transition-all bg-[#D32F2F] text-white';
  }

  configurarSlicer('slicer-hoy', 'hoy');
  configurarSlicer('slicer-semana', 'semana');
  configurarSlicer('slicer-mes', 'mes');
  configurarSlicer('slicer-anio', 'anio');

  document.getElementById('buscador-operaciones-periodo-admin')?.addEventListener('input', procesarGraficosSlicers);
  document.getElementById('buscador-ventas-mes-admin')?.addEventListener('input', procesarGraficosSlicers);

  // Set default active slicer
  setActiveSlicer(filtroTemporalActual);
  procesarGraficosSlicers();
}

function procesarGraficosSlicers() {
  const ahora = new Date();
  const limiteHoy = new Date();
  limiteHoy.setHours(0, 0, 0, 0);

  const ventasFiltradas = ventasCacheGlobalAdmin.filter((venta) => {
    if (!venta.fecha) return false;
    if (filtroTemporalActual === 'hoy') return venta.fecha >= limiteHoy;
    if (filtroTemporalActual === 'semana') return ahora - venta.fecha <= 7 * 24 * 60 * 60 * 1000;
    if (filtroTemporalActual === 'mes') return venta.fecha.getMonth() === ahora.getMonth() && venta.fecha.getFullYear() === ahora.getFullYear();
    if (filtroTemporalActual === 'anio') return venta.fecha.getFullYear() === ahora.getFullYear();
    return true;
  });

  let total = 0;
  let prod = 0;
  let mbs = 0;
  let totalEfectivo = 0;
  let totalTarjeta = 0;

  // Agrupar ventas por producto (contar cantidades vendidas)
  const productCounts = {};
  ventasFiltradas.forEach((venta) => {
    total += venta.monto;
    const metodoPago = String(venta.metodoPago || venta.metodo || '').trim().toLowerCase();
    if (metodoPago === 'mixto') {
      totalEfectivo += Number(venta.montoEfectivo || 0);
      totalTarjeta += Number(venta.montoTarjeta || 0);
    } else {
      if (metodoPago === 'efectivo') totalEfectivo += venta.monto;
      if (metodoPago === 'tarjeta') totalTarjeta += venta.monto;
    }
    if (venta.tipo === 'producto') prod += venta.monto;
    if (venta.tipo === 'membresia') mbs += venta.monto;
    const items = Array.isArray(venta.productosArr) ? venta.productosArr : [];
    items.forEach((it) => {
      const name = (it.nombre || it.id || 'Producto').toString();
      const qty = Number(it.cantidad || 1);
      productCounts[name] = (productCounts[name] || 0) + qty;
    });
  });

  const etiquetasBarras = Object.keys(productCounts);
  const montosBarras = etiquetasBarras.map(k => Math.round(productCounts[k]));

  const kpiIngreso = document.getElementById('kpi-ingreso-mes');
  const kpiMiembros = document.getElementById('kpi-miembros-activos');
  const kpiProductos = document.getElementById('kpi-productos-monto');
  const kpiTicket = document.getElementById('kpi-ticket-promedio');
  const kpiEfectivo = document.getElementById('kpi-total-efectivo');
  const kpiTarjeta = document.getElementById('kpi-total-tarjeta');
  const tituloTabla = document.getElementById('titulo-tabla-operaciones-admin');

  if (kpiIngreso) kpiIngreso.textContent = `$${total.toFixed(2)}`;
  if (kpiMiembros) kpiMiembros.textContent = `${ventasFiltradas.length}`;
  if (kpiProductos) kpiProductos.textContent = `$${prod.toFixed(2)}`;
  if (kpiTicket) kpiTicket.textContent = `$${(ventasFiltradas.length > 0 ? total / ventasFiltradas.length : 0).toFixed(2)}`;
  if (kpiEfectivo) kpiEfectivo.textContent = `$${totalEfectivo.toFixed(2)}`;
  if (kpiTarjeta) kpiTarjeta.textContent = `$${totalTarjeta.toFixed(2)}`;
  const etiquetasPeriodo = { hoy: 'HOY', semana: 'SEMANA', mes: 'MES', anio: 'AÑO' };
  if (tituloTabla) tituloTabla.textContent = `Operaciones del Periodo (${etiquetasPeriodo[filtroTemporalActual] || filtroTemporalActual.toUpperCase()})`;

  // KPI: monto total de cuentas por cobrar (suma de saldoPendiente / saldo) — GLOBAL (sin filtrar por slicer)
  const kpiCuentas = document.getElementById('kpi-cuentas-por-cobrar');
  const pendientes = ventasCacheGlobalAdmin.filter(v => (v.estadoPago === 'pendiente') || (v.saldoPendiente && Number(v.saldoPendiente) > 0));
  const montoPendienteTotal = pendientes.reduce((acc, v) => {
    const val = Number(v.saldoPendiente ?? v.saldo ?? 0);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
  if (kpiCuentas) kpiCuentas.textContent = montoPendienteTotal.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  const terminoOperaciones = (document.getElementById('buscador-operaciones-periodo-admin')?.value || '').trim().toLowerCase();
  const operacionesFiltradas = ventasFiltradas.filter((venta) => {
    const textoBusqueda = `${venta.concepto || ''} ${venta.tipo || ''} ${venta.metodoPago || venta.metodo || ''}`.toLowerCase();
    return !terminoOperaciones || textoBusqueda.includes(terminoOperaciones);
  });

  const tbodyAdmin = document.getElementById('tabla-dashboard-ventas-admin');
  if (tbodyAdmin) {
    if (operacionesFiltradas.length === 0) {
      tbodyAdmin.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-zinc-400 italic">${terminoOperaciones ? 'Sin resultados para esta búsqueda.' : 'No hay transacciones registradas en este periodo.'}</td></tr>`;
    } else {
      tbodyAdmin.innerHTML = operacionesFiltradas
        .map((venta) => `
          <tr class="border-b hover:bg-zinc-50 text-[11px] transition-colors">
            <td class="py-2.5 text-zinc-500 font-mono">${venta.fecha.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td class="py-2 font-bold text-zinc-800">${venta.concepto}</td>
            <td class="py-2 uppercase font-bold text-[9px] text-zinc-400 tracking-wider">${venta.tipo === 'membresia' ? '🎫 Membresía' : '📦 Producto'}</td>
            <td class="py-2 text-center"><span class="px-2 py-1 rounded font-bold text-[9px] uppercase ${(() => { const metodo = String(venta.metodoPago || venta.metodo || 'EFECTIVO').toUpperCase(); return metodo === 'TARJETA' ? 'bg-blue-100 text-blue-700' : metodo === 'MIXTO' ? 'bg-purple-100 text-purple-700' : metodo === 'ABONO' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-700'; })()}">${venta.metodoPago || venta.metodo || 'EFECTIVO'}</span></td>
            <td class="py-2 font-black text-right text-zinc-950">$${venta.monto.toFixed(2)}</td>
            <td class="py-2 text-right"><button data-id="${venta.id}" class="btn-anular-gerencial text-red-600 font-bold hover:underline">Anular 🗑️</button></td>
          </tr>
        `)
        .join('');

      tbodyAdmin.querySelectorAll('.btn-anular-gerencial').forEach((btn) => {
        btn.onclick = async () => {
          const idVenta = btn.getAttribute('data-id');
          if (!idVenta) return;
          await anularVentaAdmin(idVenta);
        };
      });
    }
  }

  const ventasDelMes = ventasCacheGlobalAdmin.filter((venta) => {
    return venta.fecha && venta.fecha.getMonth() === ahora.getMonth() && venta.fecha.getFullYear() === ahora.getFullYear();
  });
  const terminoVentasMes = (document.getElementById('buscador-ventas-mes-admin')?.value || '').trim().toLowerCase();
  const ventasMesFiltradas = ventasDelMes.filter((venta) => {
    const textoBusqueda = `${venta.concepto || ''} ${venta.tipo || ''} ${venta.metodoPago || venta.metodo || ''}`.toLowerCase();
    return !terminoVentasMes || textoBusqueda.includes(terminoVentasMes);
  });
  const tbodyMes = document.getElementById('tabla-ventas-mes-admin');
  if (tbodyMes) {
    if (ventasMesFiltradas.length === 0) {
      tbodyMes.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-zinc-400 italic">${terminoVentasMes ? 'Sin resultados para esta búsqueda.' : 'No hay ventas del mes registradas.'}</td></tr>`;
    } else {
      tbodyMes.innerHTML = ventasMesFiltradas
        .map((venta) => `
          <tr class="border-b hover:bg-zinc-50 text-[11px] transition-colors">
            <td class="py-2.5 text-zinc-500 font-mono">${venta.fecha.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td class="py-2 font-bold text-zinc-800">${venta.concepto}</td>
            <td class="py-2 uppercase font-bold text-[9px] text-zinc-400 tracking-wider">${venta.tipo === 'membresia' ? '🎫 Membresía' : '📦 Producto'}</td>
            <td class="py-2 text-center"><span class="px-2 py-0.5 rounded-full font-black text-[9px] uppercase ${venta.metodoPago === 'Tarjeta' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}">${venta.metodoPago}</span></td>
            <td class="py-2 font-black text-right text-zinc-950">$${venta.monto.toFixed(2)}</td>
            <td class="py-2 text-right"><button data-id="${venta.id}" class="btn-anular-mes text-red-600 font-bold hover:underline">Anular 🗑️</button></td>
          </tr>
        `)
        .join('');

      tbodyMes.querySelectorAll('.btn-anular-mes').forEach((btn) => {
        btn.onclick = async () => {
          const idVenta = btn.getAttribute('data-id');
          if (!idVenta) return;
          await anularVentaAdmin(idVenta);
        };
      });
    }
  }

  if (window.Chart) {
    const ctxLinea = document.getElementById('chart-linea-ingresos');
    if (ctxLinea) {
      if (chartLineaAdmin) {
        chartLineaAdmin.destroy();
        chartLineaAdmin = null;
      }
      chartLineaAdmin = new Chart(ctxLinea, {
        type: 'bar',
        data: {
          labels: etiquetasBarras,
          datasets: [{ data: montosBarras, backgroundColor: '#D32F2F', borderRadius: 6 }]
        },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
      });
    }

    const ctxDona = document.getElementById('chart-dona-mix');
    if (ctxDona) {
      if (chartDonaAdmin) {
        chartDonaAdmin.destroy();
        chartDonaAdmin = null;
      }
      // Reemplazar gráfica de dona por gráfica de afluencia: ventas por horario
      const horasLabels = Array.from({length:24}, (_,i) => (i < 10 ? '0' + i : ''+i) + ':00');
      const horasCounts = Array.from({length:24}, () => 0);
      ventasFiltradas.forEach(v => {
        try {
          const h = (v.fecha && typeof v.fecha.getHours === 'function') ? v.fecha.getHours() : (new Date(v.fecha)).getHours();
          horasCounts[h] = (horasCounts[h] || 0) + 1;
        } catch(e) { }
      });

      chartDonaAdmin = new Chart(ctxDona, {
          type: 'bar',
          data: {
            labels: horasLabels,
            datasets: [{ data: horasCounts, backgroundColor: '#121212' }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });
    }
  }
}

function cargarPantallaRoles() {
  destruirGraficosEstructurales();
  if (!contenedorPantallas) return;

  contenedorPantallas.innerHTML = `
    <div class="space-y-4 max-w-6xl select-none">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 class="text-2xl font-black">Productos</h2>
          <p class="text-zinc-500 text-xs">Gestiona precios de servicios y el inventario de productos físicos.</p>
        </div>
        <button id="btn-mostrar-formulario-add" class="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl px-3 py-2">Agregar Artículo ➕</button>
      </div>

      <div id="wrapper-form-add-producto" class="hidden bg-white border p-4 rounded-3xl space-y-3 shadow-sm">
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div class="sm:col-span-2"><label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Nombre</label><input type="text" id="add-admin-nombre" class="w-full px-3 py-2 bg-zinc-50 border rounded-xl text-xs outline-none" /></div>
            <div id="wrapper-add-imagen">
              <label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Fotografía</label>
              <input type="file" id="add-admin-imagen" accept="image/*" capture="environment" class="w-full px-3 py-2 bg-zinc-50 border rounded-xl text-xs outline-none" />
              <div id="preview-add-admin-imagen" class="mt-2"></div>
            </div>
            <div id="wrapper-add-precio"><label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Precio</label><input type="number" id="add-admin-precio" min="0" class="w-full px-3 py-2 bg-zinc-50 border rounded-xl text-xs outline-none" /></div>
            <div>
              <label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Tipo</label>
              <select id="add-admin-tipo" class="w-full px-3 py-2 bg-zinc-50 border rounded-xl text-xs outline-none font-bold">
                <option value="producto">Producto Físico (Con Stock)</option>
                <option value="servicio">Servicio (Sin Stock/Visitas/Membresías)</option>
              </select>
            </div>
            <div id="wrapper-add-stock-field"><label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Stock Disponible</label><input type="number" id="add-admin-stock" value="10" class="w-full px-3 py-2 bg-zinc-50 border rounded-xl text-xs outline-none" /></div>
          </div>
        <label class="flex items-center gap-2 text-xs font-bold text-zinc-700">
          <input type="checkbox" id="add-admin-es-submenu" class="h-4 w-4 accent-red-600">
          ¿Tiene submenú / variantes?
        </label>
        <div id="wrapper-add-variantes" class="hidden rounded-2xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase text-zinc-500">Variantes</span>
            <button type="button" id="btn-add-variante" class="rounded-xl bg-zinc-900 px-2.5 py-1 text-[10px] font-bold text-white">Agregar variante</button>
          </div>
          <div id="lista-add-variantes" class="space-y-2"></div>
        </div>
        <div class="flex gap-2 justify-end">
          <button id="btn-admin-cancelar-add" class="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs">Cancelar</button>
          <button id="btn-admin-guardar-add" class="px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-xs">Guardar</button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="bg-white border rounded-3xl p-4 shadow-sm overflow-x-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold uppercase text-zinc-900">Precios de Servicios</h3>
            <input id="buscador-servicios-admin" type="search" placeholder="Buscar servicio..." class="w-48 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] outline-none focus:border-red-500">
          </div>
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="text-zinc-400 border-b"><th class="pb-2">Servicio</th><th class="pb-2">Precio</th><th class="pb-2 text-right">Acción</th></tr>
            </thead>
            <tbody id="tabla-servicios-admin"></tbody>
          </table>
        </div>

        <div class="bg-white border rounded-3xl p-4 shadow-sm overflow-x-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold uppercase text-zinc-900">Inventario de Productos</h3>
            <input id="buscador-productos-admin" type="search" placeholder="Buscar producto..." class="w-48 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] outline-none focus:border-red-500">
          </div>
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="text-zinc-400 border-b"><th class="pb-2">Producto</th><th class="pb-2">Precio</th><th class="pb-2">Stock</th><th class="pb-2">Foto</th><th class="pb-2 text-right">Acción</th></tr>
            </thead>
            <tbody id="tabla-productos-editables-admin"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const tipoSelect = document.getElementById('add-admin-tipo');
  if (tipoSelect) {
    tipoSelect.onchange = (e) => {
      const wrapper = document.getElementById('wrapper-add-stock-field');
      if (!wrapper) return;
      if (e.target.value === 'servicio') wrapper.classList.add('hidden');
      else wrapper.classList.remove('hidden');
    };
  }

  document.getElementById('buscador-servicios-admin')?.addEventListener('input', renderServiciosAdmin);
  document.getElementById('buscador-productos-admin')?.addEventListener('input', renderProductosCatalogoAdmin);

  renderServiciosAdmin();
  renderProductosCatalogoAdmin();
}

function renderServiciosAdmin() {
  const tabla = document.getElementById('tabla-servicios-admin');
  if (!tabla) return;

  const servicios = [
    { id: 'semana', label: 'Membresía Semana' },
    { id: 'membresia', label: 'Membresía Mes' },
    { id: 'visita', label: 'Visita' },
    { id: 'caminadora', label: 'Caminadora' }
  ];

  const termino = (document.getElementById('buscador-servicios-admin')?.value || '').trim().toLowerCase();
  const serviciosFiltrados = servicios.filter((servicio) => {
    const textoBusqueda = `${servicio.label} ${servicio.id}`.toLowerCase();
    return !termino || textoBusqueda.includes(termino);
  });

  if (serviciosFiltrados.length === 0) {
    tabla.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-zinc-400 italic">Sin resultados para esta búsqueda.</td></tr>`;
    return;
  }

  tabla.innerHTML = serviciosFiltrados
    .map((servicio) => {
      return `
      <tr class="border-b hover:bg-zinc-50">
        <td class="py-3 font-bold text-zinc-800">${servicio.label}</td>
        <td class="py-3 text-center"><input type="number" data-precio-id="${servicio.id}" value="${preciosServiciosLocal[servicio.id] ?? 0}" class="w-32 border rounded-lg p-1 text-center font-bold bg-zinc-50 text-xs" /></td>
        <td class="py-3 text-right"><button type="button" data-id="${servicio.id}" class="btn-servicio-save bg-zinc-900 text-white px-2.5 py-1 rounded-xl text-[11px] font-bold">Guardar</button></td>
      </tr>
    `;
    })
    .join('');

  tabla.querySelectorAll('.btn-servicio-save').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      const input = tabla.querySelector(`input[data-precio-id="${id}"]`);
      if (!id || !input) return;
      const precio = Number(input.value);
      if (!Number.isFinite(precio) || precio < 0) {
        mostrarToastAdmin('Ingresa un precio válido.', 'error');
        return;
      }

      try {
        const payload = { [id]: precio };
        await setDoc(refServiciosPrecios, {
          ...payload,
          [`${id}ImagenUrl`]: deleteField()
        }, { merge: true });
        preciosServiciosLocal = { ...preciosServiciosLocal, ...payload };
        renderServiciosAdmin();
        mostrarToastAdmin('Precio de servicio guardado (sin foto).', 'success');
      } catch (error) {
        console.error(error);
        mostrarToastAdmin(mensajeErrorProducto(error), 'error');
      }
    };
  });
}

function renderProductosCatalogoAdmin() {
  const tabla = document.getElementById('tabla-productos-editables-admin');
  if (!tabla) return;

  const productosFisicos = productosVentaRapidaAdmin.filter((p) => p.tipo !== 'servicio');
  const termino = (document.getElementById('buscador-productos-admin')?.value || '').trim().toLowerCase();
  const productosFiltrados = productosFisicos.filter((p) => {
    const textoBusqueda = `${p.nombre || ''} ${p.tipo || ''}`.toLowerCase();
    return !termino || textoBusqueda.includes(termino);
  });

  if (productosFiltrados.length === 0) {
    tabla.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-zinc-400 italic">${termino ? 'Sin resultados para esta búsqueda.' : 'No hay productos físicos registrados.'}</td></tr>`;
    return;
  }

  tabla.innerHTML = productosFiltrados
    .map((p) => `
      <tr class="border-b hover:bg-zinc-50">
        <td class="py-3 font-bold text-zinc-800"><span class="truncate">${escaparHtml(p.nombre)}</span></td>
        <td class="py-3 text-center">
          ${p.esSubmenu
            ? '<span class="text-[10px] text-zinc-500 italic">El precio puede variar*</span>'
            : `<input type="number" value="${p.precio}" data-precio-id="${p.id}" class="w-20 border rounded-lg p-1 text-center font-bold bg-zinc-50 text-xs" />`}
        </td>
        <td class="py-3 text-center"><input type="number" value="${p.stock ?? 0}" data-stock-id="${p.id}" class="w-16 border rounded-lg p-1 text-center font-bold bg-zinc-50 text-xs" /></td>
        <td class="py-3 text-center">
          <div class="flex flex-col items-center gap-1">
            <div data-producto-preview="${escaparHtml(p.id)}">${p.esSubmenu
              ? miniaturaImagenHTML('', 'h-10 w-10 rounded-lg')
              : miniaturaImagenHTML(p.imagenUrl, 'h-10 w-10 rounded-lg')}</div>
            ${p.esSubmenu
              ? '<span class="text-[9px] text-zinc-500">Fotos por variante</span>'
              : `<input type="file" accept="image/*" capture="environment" data-imagen-id="${escaparHtml(p.id)}" class="w-32 text-[9px]" aria-label="Foto de ${escaparHtml(p.nombre)}">`}
          </div>
        </td>
        <td class="py-3 text-right">
          <div class="inline-flex gap-1 justify-end flex-wrap justify-end">
            <button data-id="${p.id}" class="btn-admin-save-item bg-zinc-900 text-white px-2.5 py-1 rounded-xl text-[11px] font-bold">Guardar</button>
            ${p.esSubmenu ? `<button data-submenu-edit="${escaparHtml(p.id)}" class="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-xl text-[11px] font-bold">Variantes</button>` : ''}
            <button data-id="${p.id}" class="btn-admin-delete-item bg-red-50 text-red-600 px-2.5 py-1 rounded-xl text-[11px]">Eliminar</button>
          </div>
        </td>
      </tr>
    `)
    .join('');

  tabla.querySelectorAll('input[data-imagen-id]').forEach((input) => {
    input.onchange = () => {
      const file = input.files?.[0];
      const preview = tabla.querySelector(`[data-producto-preview="${input.dataset.imagenId}"]`);
      if (file && preview) {
        preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" class="h-10 w-10 rounded-lg object-cover">`;
      }
    };
  });

  tabla.querySelectorAll('[data-submenu-edit]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-submenu-edit');
      const producto = productosVentaRapidaAdmin.find((item) => item.id === id);
      if (producto) abrirEditorVariantesAdmin(producto);
    };
  });

  function abrirEditorVariantesAdmin(producto) {
    const variantesIniciales = Array.isArray(producto.variantes)
      ? producto.variantes.map((variante) => ({
          nombre: variante?.nombre || '',
          precio: Number(variante?.precio ?? producto.precio ?? 0),
          stock: Number(variante?.stock ?? 0),
          imagenUrl: variante?.imagenUrl || ''
        }))
      : [];
    const variantes = [...variantesIniciales];
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4';

    const renderEditor = () => {
      overlay.innerHTML = `
        <div class="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <h3 class="text-lg font-black text-zinc-900">Editar variantes</h3>
              <p class="text-xs text-zinc-500">${escaparHtml(producto.nombre)}</p>
            </div>
            <button type="button" data-submenu-close class="text-xl text-zinc-400">✕</button>
          </div>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase text-zinc-500">Variantes</span>
              <button type="button" data-submenu-add class="rounded-xl bg-zinc-900 px-2.5 py-1.5 text-[10px] font-bold text-white">Agregar</button>
            </div>
            <div id="submenu-editor-list" class="space-y-2 max-h-[350px] overflow-y-auto pr-1"></div>
          </div>
          <div class="mt-5 flex gap-3">
            <button type="button" data-submenu-cancel class="flex-1 rounded-xl bg-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-800">Cancelar</button>
            <button type="button" data-submenu-save class="flex-1 rounded-xl bg-[#D32F2F] px-4 py-2.5 text-sm font-bold text-white">Guardar</button>
          </div>
        </div>
      `;

      const list = overlay.querySelector('#submenu-editor-list');
      list.innerHTML = variantes.map((variante, index) => `
        <div class="grid grid-cols-1 sm:grid-cols-[1.2fr_90px_90px_auto] gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-2">
          <input type="text" data-submenu-nombre="${index}" value="${escaparHtml(variante.nombre)}" placeholder="Nombre" class="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-red-500" />
          <input type="number" data-submenu-precio="${index}" value="${Number(variante.precio || 0)}" min="0" step="0.01" placeholder="Precio" class="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-red-500" />
          <input type="number" data-submenu-stock="${index}" value="${Number(variante.stock || 0)}" min="0" step="1" placeholder="Stock" class="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-red-500" />
          <button type="button" data-submenu-remove="${index}" class="rounded-lg bg-red-50 px-2 py-1.5 text-[10px] font-bold text-red-600">Quitar</button>
          <div class="col-span-full flex items-center gap-3">
            <div data-submenu-preview="${index}">${miniaturaImagenHTML(variante.imagenUrl, 'h-12 w-12 rounded-lg')}</div>
            <label class="text-[10px] font-bold text-zinc-600">Foto
              <input type="file" data-submenu-image="${index}" accept="image/*" capture="environment" class="ml-2 max-w-48 text-[10px]">
            </label>
          </div>
        </div>
      `).join('');

      overlay.querySelectorAll('[data-submenu-image]').forEach((input) => {
        input.onchange = () => {
          const file = input.files?.[0];
          const index = Number(input.dataset.submenuImage);
          const preview = overlay.querySelector(`[data-submenu-preview="${index}"]`);
          if (file && preview) {
            variantes[index].archivoImagen = file;
            preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" class="h-12 w-12 rounded-lg object-cover">`;
          }
        };
      });

      overlay.querySelectorAll('[data-submenu-remove]').forEach((button) => {
        button.onclick = () => {
          const index = Number(button.dataset.submenuRemove);
          variantes.splice(index, 1);
          renderEditor();
        };
      });

      overlay.querySelector('[data-submenu-add]').onclick = () => {
        variantes.push({ nombre: '', precio: Number(producto.precio || 0), stock: 0 });
        renderEditor();
      };

      overlay.querySelector('[data-submenu-close]').onclick = () => overlay.remove();
      overlay.querySelector('[data-submenu-cancel]').onclick = () => overlay.remove();
      overlay.querySelector('[data-submenu-save]').onclick = async () => {
        const datosValidos = variantes
          .map((variante, index) => {
            const nombre = (overlay.querySelector(`[data-submenu-nombre="${index}"]`)?.value || '').trim();
            const precio = Number(overlay.querySelector(`[data-submenu-precio="${index}"]`)?.value || 0);
            const stock = Number(overlay.querySelector(`[data-submenu-stock="${index}"]`)?.value || 0);
            return { ...variante, nombre, precio, stock };
          })
          .filter((variante) => variante.nombre)
          .map((variante) => ({
            nombre: variante.nombre,
            precio: Number(variante.precio || 0),
            stock: Number(variante.stock || 0),
            imagenUrl: variante.imagenUrl,
            archivoImagen: variante.archivoImagen
          }));

        if (!datosValidos.length || datosValidos.some((variante) => !variante.imagenUrl && !variante.archivoImagen)) {
          mostrarToastAdmin('Agrega al menos una variante válida y su fotografía.', 'error');
          return;
        }

        try {
          const stockTotal = datosValidos.reduce((sum, variante) => sum + Number(variante.stock || 0), 0);
          const variantesConImagen = await Promise.all(datosValidos.map(async ({ archivoImagen, ...variante }) => ({
            ...variante,
            imagenUrl: archivoImagen
              ? await comprimirImagenProducto(archivoImagen)
              : variante.imagenUrl
          })));
          validarTamanoFotosProducto({ imagenUrl: '', variantes: variantesConImagen });
          await updateDoc(doc(db, 'productos', producto.id), {
            esSubmenu: true,
            imagenUrl: '',
            variantes: variantesConImagen,
            stock: stockTotal,
            precio: Number(datosValidos[0].precio || producto.precio || 0)
          });
          overlay.remove();
          renderProductosCatalogoAdmin();
          mostrarToastAdmin(datosValidos.some((variante) => variante.archivoImagen)
            ? 'Variantes y fotos comprimidas guardadas.'
            : 'Variantes actualizadas.', 'success');
        } catch (error) {
          console.error(error);
          mostrarToastAdmin(mensajeErrorProducto(error), 'error');
        }
      };
    };

    document.body.appendChild(overlay);
    renderEditor();
    overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') overlay.remove();
    }, { once: true });
  }

  const formWrapper = document.getElementById('wrapper-form-add-producto');
  const btnMostrarAdd = document.getElementById('btn-mostrar-formulario-add');
  const btnCancelarAdd = document.getElementById('btn-admin-cancelar-add');
  const btnGuardarAdd = document.getElementById('btn-admin-guardar-add');

  if (btnMostrarAdd && formWrapper) btnMostrarAdd.onclick = () => formWrapper.classList.toggle('hidden');
  if (btnCancelarAdd && formWrapper) btnCancelarAdd.onclick = () => formWrapper.classList.add('hidden');

  const submenuCheck = document.getElementById('add-admin-es-submenu');
  const variantesWrapper = document.getElementById('wrapper-add-variantes');
  const variantesList = document.getElementById('lista-add-variantes');
  const tipoProductoInput = document.getElementById('add-admin-tipo');
  const variantes = [];
  const imagenPrincipalInput = document.getElementById('add-admin-imagen');
  const actualizarVisibilidadFotografias = () => {
    const esServicio = tipoProductoInput?.value === 'servicio';
    const esSubmenu = Boolean(submenuCheck?.checked);
    document.getElementById('wrapper-add-imagen')?.classList.toggle('hidden', esServicio || esSubmenu);
    if (esServicio || esSubmenu) {
      if (imagenPrincipalInput) imagenPrincipalInput.value = '';
      const preview = document.getElementById('preview-add-admin-imagen');
      if (preview) preview.innerHTML = '';
    }
  };
  tipoProductoInput?.addEventListener('change', () => {
    const esServicio = tipoProductoInput.value === 'servicio';
    actualizarVisibilidadFotografias();
    if (esServicio) {
      variantes.forEach((variante) => {
        variante.archivoImagen = null;
        variante.imagenUrl = '';
      });
    }
    renderVariantes();
  });
  imagenPrincipalInput?.addEventListener('change', () => {
    const file = imagenPrincipalInput.files?.[0];
    const preview = document.getElementById('preview-add-admin-imagen');
    if (file && preview) {
      preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Vista previa de la fotografía" class="h-20 w-20 rounded-xl object-cover">`;
    }
  });
  const guardarValoresVariantes = () => {
    if (!variantesList) return;
    variantes.forEach((variante, index) => {
      const nombreInput = variantesList.querySelector(`[data-variante-nombre="${index}"]`);
      const precioInput = variantesList.querySelector(`[data-variante-precio="${index}"]`);
      const stockInput = variantesList.querySelector(`[data-variante-stock="${index}"]`);
      variante.nombre = nombreInput?.value || '';
      variante.precio = precioInput?.value || '';
      variante.stock = stockInput?.value || '';
      variante.imagenUrl = variante.imagenUrl || '';
    });
  };
  const renderVariantes = () => {
    if (!variantesList) return;
    const esServicio = tipoProductoInput?.value === 'servicio';
    variantesList.innerHTML = variantes.map((_, index) => `
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_6rem_6rem_auto] gap-2 items-center rounded-xl border border-zinc-200 bg-white p-2">
        <input type="text" data-variante-nombre="${index}" value="${escaparHtml(variantes[index].nombre || '')}" placeholder="Ej. Fresa" class="w-full rounded-xl border border-zinc-200 bg-white px-2 py-1.5 text-xs">
        <input type="number" data-variante-precio="${index}" value="${variantes[index].precio || ''}" min="0" placeholder="Precio" class="w-full rounded-xl border border-zinc-200 bg-white px-2 py-1.5 text-xs">
        <input type="number" data-variante-stock="${index}" value="${variantes[index].stock || ''}" min="0" placeholder="Stock" class="w-full rounded-xl border border-zinc-200 bg-white px-2 py-1.5 text-xs">
        <button type="button" data-variante-delete="${index}" class="rounded-xl bg-red-50 px-2 py-1.5 text-[10px] font-bold text-red-600">Quitar</button>
        ${esServicio ? '' : `<div class="col-span-full flex items-center gap-3">
          <div data-variante-preview="${index}">${miniaturaImagenHTML(variantes[index].archivoImagen ? URL.createObjectURL(variantes[index].archivoImagen) : variantes[index].imagenUrl, 'h-12 w-12 rounded-lg')}</div>
          <label class="text-[10px] font-bold text-zinc-600">Foto de variante
            <input type="file" data-variante-imagen="${index}" accept="image/*" capture="environment" class="ml-2 max-w-48 text-[10px]">
          </label>
        </div>`}
      </div>
    `).join('');
    variantesList.querySelectorAll('[data-variante-imagen]').forEach((input) => {
      input.onchange = () => {
        const file = input.files?.[0];
        const index = Number(input.dataset.varianteImagen);
        const preview = variantesList.querySelector(`[data-variante-preview="${index}"]`);
        if (file && preview) {
          variantes[index].archivoImagen = file;
          preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Vista previa de la variante" class="h-12 w-12 rounded-lg object-cover">`;
        }
      };
    });
    variantesList.querySelectorAll('[data-variante-delete]').forEach((button) => {
      button.onclick = () => {
        guardarValoresVariantes();
        variantes.splice(Number(button.dataset.varianteDelete), 1);
        renderVariantes();
      };
    });
  };
  if (submenuCheck) {
    submenuCheck.onchange = () => {
      variantesWrapper?.classList.toggle('hidden', !submenuCheck.checked);
      document.getElementById('wrapper-add-precio')?.classList.toggle('hidden', submenuCheck.checked);
      document.getElementById('wrapper-add-stock-field')?.classList.toggle('hidden', submenuCheck.checked);
      actualizarVisibilidadFotografias();
      if (submenuCheck.checked && variantes.length === 0) {
        variantes.push({});
        renderVariantes();
      }
    };
  }
  document.getElementById('btn-add-variante')?.addEventListener('click', () => {
    guardarValoresVariantes();
    variantes.push({});
    renderVariantes();
  });

  if (btnGuardarAdd) {
    btnGuardarAdd.onclick = async () => {
      const nombreInput = document.getElementById('add-admin-nombre');
      const precioInput = document.getElementById('add-admin-precio');
      const tipoInput = document.getElementById('add-admin-tipo');
      const stockInput = document.getElementById('add-admin-stock');
      const esSubmenu = Boolean(document.getElementById('add-admin-es-submenu')?.checked);
      if (!nombreInput || !precioInput || !tipoInput) return;

      const nombre = nombreInput.value.trim();
      const precioTexto = precioInput.value.trim();
      const precio = Number(precioTexto);
      const tipo = tipoInput.value;
      const stockTexto = stockInput?.value.trim() || '';
      const imagenPrincipal = imagenPrincipalInput?.files?.[0] || null;
      const variantesGuardadas = esSubmenu
        ? (guardarValoresVariantes(),
          variantes.map((variante) => ({
            nombre: variante.nombre.trim(),
            precio: Number(variante.precio || precio),
            stock: Number(variante.stock || 0),
            imagenUrl: variante.imagenUrl || '',
            archivoImagen: variante.archivoImagen || null
          })))
            .filter((variante) => variante.nombre)
        : [];
      const stock = esSubmenu
        ? variantesGuardadas.reduce((total, variante) => total + variante.stock, 0)
        : (tipo === 'servicio' ? 0 : Number(stockTexto));
      const requiereFotoGeneral = tipo !== 'servicio' && !esSubmenu;
      const tipoEsValido = tipo === 'producto' || tipo === 'servicio';
      const camposVariantesValidos = variantesGuardadas.length > 0
        && variantesGuardadas.length === variantes.length
        && variantes.every((variante) => variante.nombre.trim() && variante.precio !== '' && Number(variante.precio) >= 0 && variante.stock !== '' && Number(variante.stock) >= 0 && (tipo === 'servicio' || variante.imagenUrl || variante.archivoImagen));
      const formularioValido = Boolean(nombre)
        && tipoEsValido
        && (!requiereFotoGeneral || Boolean(imagenPrincipal))
        && (esSubmenu ? camposVariantesValidos : Boolean(precioTexto) && precio >= 0 && (tipo === 'servicio' || (Boolean(stockTexto) && stock >= 0)));
      if (!formularioValido) {
        mostrarToastAdmin(tipo === 'servicio'
          ? 'Completa los campos obligatorios del servicio.'
          : 'Completa los campos obligatorios y agrega una fotografía para el producto y cada variante.', 'error');
        return;
      }

      const textoBotonGuardar = btnGuardarAdd.textContent;
      btnGuardarAdd.disabled = true;
      btnGuardarAdd.textContent = requiereFotoGeneral || variantesGuardadas.some((variante) => variante.archivoImagen)
        ? 'Comprimiendo fotos…'
        : 'Guardando…';
      try {
        const imagenUrl = requiereFotoGeneral
          ? await comprimirImagenProducto(imagenPrincipal)
          : '';
        const variantesConImagen = await Promise.all(variantesGuardadas.map(async ({ archivoImagen, ...variante }) => ({
          ...variante,
          imagenUrl: tipo === 'servicio'
            ? ''
            : archivoImagen
            ? await comprimirImagenProducto(archivoImagen)
            : variante.imagenUrl
        })));
        const productoNuevo = {
          nombre,
          precio,
          tipo,
          stock,
          imagenUrl,
          esSubmenu,
          variantes: variantesConImagen
        };
        validarTamanoFotosProducto(productoNuevo);
        await addDoc(collection(db, 'productos'), productoNuevo);
        if (formWrapper) formWrapper.classList.add('hidden');
        mostrarToastAdmin(tipo === 'servicio'
          ? `Servicio guardado (sin foto): ${nombre}`
          : esSubmenu
          ? `Producto y fotos comprimidas de variantes guardados: ${nombre}`
          : `Producto y fotografía comprimida guardados: ${nombre}`, 'success');
      } catch (error) {
        console.error(error);
        mostrarToastAdmin(mensajeErrorProducto(error), 'error');
      } finally {
        btnGuardarAdd.disabled = false;
        btnGuardarAdd.textContent = textoBotonGuardar;
      }
    };
  }

  tabla.querySelectorAll('.btn-admin-save-item').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;
      const inputPrecio = tabla.querySelector(`input[data-precio-id="${id}"]`);
      const inputStock = tabla.querySelector(`input[data-stock-id="${id}"]`);
      const inputImagen = tabla.querySelector(`input[data-imagen-id="${id}"]`);
      const producto = productosVentaRapidaAdmin.find((item) => item.id === id);
      if (!producto) return;

      const precio = inputPrecio ? Number(inputPrecio.value) : Number(producto.precio || 0);
      if (!Number.isFinite(precio) || precio < 0) {
        mostrarToastAdmin('Ingresa un precio válido.', 'error');
        return;
      }
      const updateData = { precio };
      if (producto.tipo !== 'servicio' && inputStock) {
        updateData.stock = Number(inputStock.value);
      }

      try {
        const file = inputImagen?.files?.[0];
        if (file) updateData.imagenUrl = await comprimirImagenProducto(file);
        validarTamanoFotosProducto({
          imagenUrl: updateData.imagenUrl ?? producto.imagenUrl,
          variantes: producto.variantes
        });
        await updateDoc(doc(db, 'productos', id), updateData);
        mostrarToastAdmin(file ? 'Producto y fotografía comprimida guardados.' : 'Cambios guardados', 'success');
      } catch (error) {
        console.error(error);
        mostrarToastAdmin(mensajeErrorProducto(error), 'error');
      }
    };
  });

  tabla.querySelectorAll('.btn-admin-delete-item').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;
      if (!(await confirmarAdmin('¿Deseas eliminar este producto de la nube permanentemente?', 'Eliminar producto'))) return;
      try {
        await deleteDoc(doc(db, 'productos', id));
        mostrarToastAdmin('Producto eliminado.', 'success');
      } catch (error) {
        console.error(error);
        mostrarToastAdmin(MENSAJE_ERROR_ADMIN, 'error');
      }
    };
  });
}

function cargarPantallaSeguridad() {
  destruirGraficosEstructurales();
  if (!contenedorPantallas) return;

  contenedorPantallas.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="space-y-4">
        <div>
          <h2 class="text-2xl font-black">Actualizar contraseña</h2>
        </div>
        <form id="form-admin-security" class="bg-white border p-5 rounded-3xl space-y-3 shadow-sm">
          <div><label class="block text-[10px] font-bold text-zinc-400">Contraseña Nueva</label><input type="password" id="new-p" required class="w-full border rounded-xl p-2 text-xs outline-none focus:border-red-500"></div>
          <button type="submit" class="w-full py-2 bg-zinc-900 text-white font-bold text-xs rounded-xl shadow-md">ACTUALIZAR CONTRASEÑA</button>
        </form>
      </div>

      <div class="space-y-4">
        <div>
          <h3 class="text-lg font-bold">Pregunta de Seguridad</h3>
          <p class="text-zinc-500 text-xs">Usada para recuperación de acceso.</p>
        </div>
        <form id="form-admin-security-question" class="bg-white border p-5 rounded-3xl space-y-3 shadow-sm">
          <div>
            <label class="block text-[10px] font-bold text-zinc-400">Pregunta</label>
            <select id="seg-pregunta-select" class="w-full border rounded-xl p-2 text-xs outline-none">
              <option value="cumpleanios">¿Cuál es tu fecha de nacimiento?</option>
              <option value="mascota">¿Cuál fue el nombre de tu primera mascota?</option>
              <option value="escuela">¿Cuál es el nombre de tu escuela primaria?</option>
              <option value="ciudad">¿En qué ciudad naciste?</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-zinc-400">Respuesta</label>
            <input type="text" id="seg-respuesta-input" autocomplete="off" class="w-full border rounded-xl p-2 text-xs outline-none focus:border-red-500">
          </div>
          <div class="rounded-xl bg-zinc-50 p-3 text-xs">
            <p class="font-bold text-zinc-500">Pregunta actual</p>
            <p id="seg-pregunta-actual" class="mt-1 text-zinc-800">Sin configurar</p>
            <div class="mt-2 flex items-center justify-between gap-2">
              <span class="font-bold text-zinc-500">Respuesta guardada</span>
              <button type="button" id="btn-seguridad-revelar" class="text-zinc-600 hover:text-zinc-900" aria-label="Mostrar respuesta" title="Mostrar u ocultar respuesta">
                <span class="material-symbols-outlined text-lg">visibility</span>
              </button>
            </div>
            <p id="seg-respuesta-actual" class="mt-1 break-all font-mono text-zinc-800">No configurada</p>
          </div>
          <button type="button" id="btn-guardar-pregunta" class="w-full py-2 bg-zinc-900 text-white font-bold text-xs rounded-xl shadow-md">Guardar Pregunta de Seguridad</button>
        </form>
      </div>

      <section class="space-y-4">
        <div>
          <h3 class="text-lg font-bold">Autenticación en dos pasos</h3>
          <p class="text-zinc-500 text-xs">Requiere un código temporal de Google Authenticator o Microsoft Authenticator al recuperar la contraseña.</p>
        </div>
        <div class="rounded-3xl border bg-white p-5 shadow-sm">
          <div id="estado-2fa" class="text-sm text-zinc-600">Cargando configuración…</div>
          <div id="acciones-2fa" class="mt-4"></div>
        </div>
      </section>
    </div>
  `;

  const form = document.getElementById('form-admin-security');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const np = document.getElementById('new-p')?.value.trim();
    if (!np || np.length < 4) {
      mostrarToastAdmin('Mínimo 4 caracteres', 'error');
      return;
    }
    try {
      await setDoc(refCredenciales, {
        password: np,
        ultimaActualizacion: new Date().toISOString()
      }, { merge: true });
      datosSeguridadLocal = { ...datosSeguridadLocal, password: np };
      mostrarToastAdmin('Contraseña modificada con éxito.', 'success');
      form.reset();
    } catch (error) {
      console.error(error);
      mostrarToastAdmin(MENSAJE_ERROR_ADMIN, 'error');
    }
  };

  const preguntaSelect = document.getElementById('seg-pregunta-select');
  const respuestaInput = document.getElementById('seg-respuesta-input');
  const renderizarTipoRespuesta = () => {
    if (!preguntaSelect || !respuestaInput) return;
    const esFecha = preguntaSelect.value === 'cumpleanios';
    respuestaInput.type = esFecha ? 'date' : 'text';
    respuestaInput.placeholder = esFecha ? '' : 'Escribe tu respuesta';
    respuestaInput.autocomplete = 'off';
  };
  preguntaSelect?.addEventListener('change', renderizarTipoRespuesta);
  renderizarTipoRespuesta();

  let respuestaRevelada = false;
  const actualizarResumenPregunta = (datos) => {
    const preguntaActual = document.getElementById('seg-pregunta-actual');
    const respuestaActual = document.getElementById('seg-respuesta-actual');
    const revealButton = document.getElementById('btn-seguridad-revelar');
    const preguntaId = datos?.seguridadPreguntaId || (datos?.nacimiento ? 'cumpleanios' : '');
    const respuesta = datos?.seguridadRespuesta || datos?.nacimiento;
    if (preguntaActual) preguntaActual.textContent = preguntaId ? obtenerPreguntaSeguridad(preguntaId) : 'Sin configurar';
    if (respuestaActual) {
      respuestaActual.textContent = respuesta
        ? (respuestaRevelada ? respuesta : '•'.repeat(Math.min(String(respuesta).length, 16)))
        : 'No configurada';
    }
    if (revealButton) {
      revealButton.disabled = !respuesta;
      revealButton.innerHTML = `<span class="material-symbols-outlined text-lg">${respuestaRevelada ? 'visibility_off' : 'visibility'}</span>`;
      revealButton.setAttribute('aria-label', respuestaRevelada ? 'Ocultar respuesta' : 'Mostrar respuesta');
    }
  };
  document.getElementById('btn-seguridad-revelar')?.addEventListener('click', () => {
    respuestaRevelada = !respuestaRevelada;
    actualizarResumenPregunta(datosSeguridadLocal);
  });

  const estado2FA = document.getElementById('estado-2fa');
  const acciones2FA = document.getElementById('acciones-2fa');
  const renderizarEstado2FA = () => {
    if (!estado2FA || !acciones2FA) return;
    const habilitado = datosSeguridadLocal?.autenticacion2FA === true && Boolean(datosSeguridadLocal?.totpSecret);
    estado2FA.innerHTML = habilitado
      ? '<span class="font-bold text-emerald-700">2FA habilitado</span><p class="mt-1 text-xs text-zinc-500">Se solicitará un código al recuperar la contraseña.</p>'
      : '<span class="font-bold text-zinc-800">2FA deshabilitado</span><p class="mt-1 text-xs text-zinc-500">Puedes vincular una app Authenticator para proteger la recuperación.</p>';
    acciones2FA.innerHTML = habilitado
      ? '<button type="button" id="btn-desactivar-2fa" class="rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-700">Deshabilitar 2FA</button>'
      : '<button type="button" id="btn-activar-2fa" class="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white">Habilitar 2FA con Google Authenticator</button>';
    document.getElementById('btn-activar-2fa')?.addEventListener('click', activar2FA);
    document.getElementById('btn-desactivar-2fa')?.addEventListener('click', desactivar2FA);
  };

  async function activar2FA() {
    try {
      const secret = new OTPAuth.Secret({ size: 20 });
      const totp = crearTOTP(secret);
      const qrDataUrl = await QRCode.toDataURL(totp.toString(), { width: 220, margin: 2 });
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
      overlay.innerHTML = `
        <form class="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
          <div>
            <h3 class="text-lg font-black text-zinc-900">Configurar 2FA</h3>
            <p class="mt-1 text-sm text-zinc-600">Escanea el código con Google Authenticator o Microsoft Authenticator.</p>
          </div>
          <img src="${qrDataUrl}" alt="Código QR de configuración TOTP" class="mx-auto h-56 w-56">
          <div class="rounded-xl bg-zinc-100 p-3 text-center">
            <p class="text-[10px] font-bold uppercase text-zinc-500">Clave manual</p>
            <code class="break-all text-sm font-bold text-zinc-900">${escaparHtml(secret.base32)}</code>
          </div>
          <label class="block text-xs font-bold text-zinc-600">Código de verificación
            <input data-setup-totp type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="000000" class="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-red-500">
          </label>
          <p data-setup-status class="hidden text-center text-xs font-semibold"></p>
          <div class="flex gap-3">
            <button type="button" data-setup-cancel class="flex-1 rounded-xl bg-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-800">Cancelar</button>
            <button type="submit" class="flex-1 rounded-xl bg-[#D32F2F] px-4 py-2.5 text-sm font-bold text-white">Confirmar y activar</button>
          </div>
        </form>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('[data-setup-totp]');
      const status = overlay.querySelector('[data-setup-status]');
      const formSetup = overlay.querySelector('form');
      const close = () => {
        document.removeEventListener('keydown', onKeydown);
        overlay.remove();
      };
      const onKeydown = (event) => {
        if (event.key === 'Escape') close();
      };
      input.focus();
      input.addEventListener('input', () => {
        const valid = /^\d{6}$/.test(input.value) && totp.validate({ token: input.value, window: 1 }) !== null;
        status.textContent = input.value.length < 6 ? '' : (valid ? 'Código válido.' : 'Código no válido o expirado.');
        status.classList.toggle('hidden', input.value.length < 6);
        status.classList.toggle('text-emerald-600', valid);
        status.classList.toggle('text-red-600', !valid && input.value.length >= 6);
      });
      overlay.querySelector('[data-setup-cancel]').onclick = close;
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
      });
      formSetup.onsubmit = async (event) => {
        event.preventDefault();
        if (totp.validate({ token: input.value.trim(), window: 1 }) === null) {
          status.textContent = 'Ingresa un código actual válido de 6 dígitos.';
          status.classList.remove('hidden', 'text-emerald-600');
          status.classList.add('text-red-600');
          return;
        }
        try {
          await setDoc(refCredenciales, {
            autenticacion2FA: true,
            totpSecret: secret.base32,
            ultimaActualizacion: new Date().toISOString()
          }, { merge: true });
          datosSeguridadLocal = { ...datosSeguridadLocal, autenticacion2FA: true, totpSecret: secret.base32 };
          close();
          renderizarEstado2FA();
          mostrarToastAdmin('Autenticación en dos pasos habilitada.', 'success');
        } catch (error) {
          console.error(error);
          status.textContent = MENSAJE_ERROR_ADMIN;
          status.classList.remove('hidden', 'text-emerald-600');
          status.classList.add('text-red-600');
        }
      };
      document.addEventListener('keydown', onKeydown);
    } catch (error) {
      console.error('Error configurando TOTP:', error);
      mostrarToastAdmin(MENSAJE_ERROR_ADMIN, 'error');
    }
  }

  async function desactivar2FA() {
    if (!(await confirmarAdmin('¿Deseas deshabilitar la autenticación en dos pasos?'))) return;
    try {
      await updateDoc(refCredenciales, {
        autenticacion2FA: false,
        totpSecret: deleteField(),
        ultimaActualizacion: new Date().toISOString()
      });
      const { totpSecret: _secret, ...resto } = datosSeguridadLocal || {};
      datosSeguridadLocal = { ...resto, autenticacion2FA: false };
      renderizarEstado2FA();
      mostrarToastAdmin('Autenticación en dos pasos deshabilitada.', 'success');
    } catch (error) {
      console.error(error);
      mostrarToastAdmin(MENSAJE_ERROR_ADMIN, 'error');
    }
  }

  (async () => {
    try {
      const docSnap = await getDoc(refCredenciales);
      const datos = docSnap.exists() ? docSnap.data() : {};
      datosSeguridadLocal = datos;
      const sel = document.getElementById('seg-pregunta-select');
      if (sel && datos.seguridadPreguntaId) sel.value = datos.seguridadPreguntaId;
      renderizarTipoRespuesta();
      actualizarResumenPregunta(datos);
      renderizarEstado2FA();
    } catch (error) {
      console.error(error);
      mostrarToastAdmin(MENSAJE_ERROR_ADMIN, 'error');
    }
  })();

  const btnGuardarPregunta = document.getElementById('btn-guardar-pregunta');
  if (btnGuardarPregunta) {
    btnGuardarPregunta.onclick = async () => {
      const preguntaId = document.getElementById('seg-pregunta-select')?.value;
      const respuestaOriginal = document.getElementById('seg-respuesta-input')?.value || '';
      const respuesta = preguntaId === 'cumpleanios'
        ? respuestaOriginal.trim()
        : normalizarRespuestaSeguridad(respuestaOriginal);
      if (!preguntaId || !respuesta) {
        mostrarToastAdmin('Seleccione pregunta y escriba la respuesta', 'error');
        return;
      }
      try {
        await setDoc(
          refCredenciales,
          { seguridadPreguntaId: preguntaId, seguridadRespuesta: respuesta, ultimaActualizacion: new Date().toISOString() },
          { merge: true }
        );
        datosSeguridadLocal = { ...datosSeguridadLocal, seguridadPreguntaId: preguntaId, seguridadRespuesta: respuesta };
        respuestaRevelada = false;
        actualizarResumenPregunta(datosSeguridadLocal);
        mostrarToastAdmin('Pregunta de seguridad guardada.', 'success');
        respuestaInput.value = '';
      } catch (error) {
        console.error(error);
        mostrarToastAdmin(MENSAJE_ERROR_ADMIN, 'error');
      }
    };
  }
}

function MarcarBotonYTab(b, f) {
  [btnEstadisticas, btnRoles, btnSeguridad, btnPrincipal, btnMembresias, btnDinamicas, btnAbonos].forEach((btn) => {
    if (btn) btn.className = 'w-full flex items-center gap-4 px-4 py-3 rounded-xl transition text-zinc-400 hover:bg-zinc-900 hover:text-white font-medium text-left text-sm';
  });
  if (b) b.className = 'w-full flex items-center gap-4 px-4 py-3 rounded-xl transition bg-[#D32F2F] text-white font-medium shadow-md text-left text-sm';
  f();
}

function destruirGraficosEstructurales() {
  if (chartLineaAdmin) {
    chartLineaAdmin.destroy();
    chartLineaAdmin = null;
  }
  if (chartDonaAdmin) {
    chartDonaAdmin.destroy();
    chartDonaAdmin = null;
  }
}

window.addEventListener('abrirEstadisticasAdmin', () => {
  verificarFiltroSeguridadAcceso(cargarPantallaEstadisticas, btnEstadisticas);
});

window.addEventListener('abrirProductosAdmin', () => {
  verificarFiltroSeguridadAcceso(cargarPantallaRoles, btnRoles);
});

window.addEventListener('abrirSeguridadAdmin', () => {
  verificarFiltroSeguridadAcceso(cargarPantallaSeguridad, btnSeguridad);
});

window.addEventListener('limpiarGraficosAdmin', () => {
  destruirGraficosEstructurales();
});
