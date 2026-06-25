// Importamos la base de datos desde tu archivo de configuración
import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp, onSnapshot, query, where, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

// Referencias DOM (Barra Lateral de index.html)
const contenedorPantallas = document.getElementById('contenedor-pantallas');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const btnPrincipal = document.getElementById('btn-principal');
const btnMembresias = document.getElementById('btn-membresias');
const btnDinamicas = document.getElementById('btn-dinamicas');
const btnEstadisticas = document.getElementById('btn-estadisticas');
const btnRoles = document.getElementById('btn-roles'); // Productos
const btnSeguridad = document.getElementById('btn-seguridad'); // Seguridad
const offlineBanner = document.getElementById('offline-banner');

// Catálogo de Productos para Venta Rápida
const productosVentaRapida = [
  { id: '1', nombre: 'Botella de Agua', precio: 15, icono: 'local_drink' },
  { id: '2', nombre: 'Refill de Agua', precio: 5, icono: 'autorenew' },
  { id: '3', nombre: 'Monster Energy', precio: 45, icono: 'bolt' },
  { id: '4', nombre: 'Amper', precio: 20, icono: 'flash_on' },
  { id: '5', nombre: 'Snack Barra', precio: 25, icono: 'cookie' },
  { id: '6', nombre: 'Visita Gym', precio: 50, icono: 'sports_gymnastics' }
];

const preciosMembresias = {
  semana: 150,
  mes: 450
};

// Paleta Deportiva Vibrante para la Ruleta
let configuracionRuleta = [
  { premio: "Visita Gratis", icono: "💪", color: "#111111", probabilidad: 40 }, 
  { premio: "10% Descuento", icono: "🔥", color: "#FF0000", probabilidad: 30 }, 
  { premio: "Monster Energy", icono: "⚡", color: "#2A2A30", probabilidad: 15 }, 
  { premio: "Barra Snack", icono: "🍫", color: "#B80000", probabilidad: 10 }, 
  { premio: "Mes Gratis", icono: "🏆", color: "#990000", probabilidad: 5 } 
];

const listaEmojisDisponibles = ["💪", "🔥", "⚡", "🍫", "🏆", "🥤", "🍏", "🏋️‍♂️", "🥊", "🎟️", "💰", "✨"];
const iconosGymSeleccion = [
  { valor: '🥤', etiqueta: 'Batido' },
  { valor: '🍶', etiqueta: 'Botella' },
  { valor: '🍫', etiqueta: 'Snack' },
  { valor: '🍪', etiqueta: 'Barra' },
  { valor: '🍏', etiqueta: 'Snack Saludable' },
  { valor: '💊', etiqueta: 'Creatina' },
  { valor: '🥛', etiqueta: 'Proteína' },
  { valor: '⚡', etiqueta: 'Preentreno' },
  { valor: '👕', etiqueta: 'Camiseta' },
  { valor: '👖', etiqueta: 'Pantalón' },
  { valor: '🎒', etiqueta: 'Bolsa' },
  { valor: '🩳', etiqueta: 'Short' },
  { valor: '🧢', etiqueta: 'Gorra' },
  { valor: '🏋️‍♂️', etiqueta: 'Gym' },
  { valor: '🛍️', etiqueta: 'Merch' }
];
const coloresGymVibrantes = ["#FF0000", "#111111", "#B80000", "#2A2A30", "#52525b", "#990000", "#7f1d1d"];
const esEmoji = (texto) => typeof texto === 'string' && /\p{Extended_Pictographic}/u.test(texto);

let desuscribirVentas = null;
let desuscribirClientes = null;
let desuscribirDashboard = null;
let pendingAdminAccess = null;

// Estado del segmentador en Estadísticas
let filtroTemporalActual = 'mes'; 

// Caché Local de Seguridad para credenciales
let datosSeguridadLocal = null;
let accesoConcedidoAdmin = false;

// Instancias de gráficas para evitar duplicados en memoria
let chartLineaAdmin = null;
let chartDonaAdmin = null;

// Sincronización de credenciales administrativas desde Firebase
const refSeguridadDB = doc(db, "configuracion", "credenciales");
const refActividadDB = doc(db, "configuracion", "actividad");
datosSeguridadLocal = { password: "Admin123", nacimiento: "2026-01-01" };
onSnapshot(refSeguridadDB, (docSnap) => {
  if (docSnap.exists()) {
    datosSeguridadLocal = docSnap.data();
  } else {
    datosSeguridadLocal = { password: "Admin123", nacimiento: "2026-01-01" };
  }
}, () => {
  datosSeguridadLocal = { password: "Admin123", nacimiento: "2026-01-01" };
});

async function marcarActividadDB() {
  try {
    await setDoc(refActividadDB, { ultimaActividad: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error('Error al actualizar actividad en DB:', err);
  }
}

function apagarEscuchasActivos() {
  if (desuscribirVentas) { desuscribirVentas(); desuscribirVentas = null; }
  if (desuscribirClientes) { desuscribirClientes(); desuscribirClientes = null; }
  if (desuscribirDashboard) { desuscribirDashboard(); desuscribirDashboard = null; }
}

// Inicialización de textos del perfil por defecto
document.getElementById('usuario-nombre').textContent = "Operador Rodeo";
document.getElementById('usuario-rol').textContent = "Mostrador";

const adminModal = document.getElementById('modal-acceso-admin');
const adminPasswordInput = document.getElementById('admin-password-input');
const adminPasswordSubmit = document.getElementById('admin-password-submit');
const adminPasswordForgot = document.getElementById('admin-password-forgot');
const adminPasswordCancel = document.getElementById('admin-password-cancel');
const adminPasswordClose = document.getElementById('admin-password-close');
const adminPasswordError = document.getElementById('admin-password-error');

function abrirModalAdmin(funcionDestino, botonActivar) {
  if (!adminModal) {
    validarAccesoAdmin = (funcionDestino, botonActivar) => {
      const clave = datosSeguridadLocal ? datosSeguridadLocal.password : "Admin123";
      const pin = prompt("🔒 Módulo Gerencial. Ingrese contraseña de Administrador:");
      if (pin === clave) {
        accesoConcedidoAdmin = true; activarBoton(botonActivar); funcionDestino();
      } else if (pin !== null) {
        mostrarSnackbarMensaje('Acceso denegado.', 'error', 3000);
      }
    };
    return;
  }
  pendingAdminAccess = { funcionDestino, botonActivar };
  adminPasswordInput.value = "";
  adminPasswordError.classList.add('hidden');
  adminModal.classList.remove('hidden');
  adminPasswordInput.focus();
}

function cerrarModalAdmin() {
  if (!adminModal) return;
  adminModal.classList.add('hidden');
  adminPasswordError.classList.add('hidden');
  pendingAdminAccess = null;
}

function autorizarAccesoAdmin() {
  if (!adminPasswordInput) return;
  const clave = datosSeguridadLocal ? datosSeguridadLocal.password : "rodeo2026";
  const pin = adminPasswordInput.value.trim();
  if (pin === clave) {
    accesoConcedidoAdmin = true;
    adminPasswordError.classList.add('hidden');
    if (pendingAdminAccess) {
      activarBoton(pendingAdminAccess.botonActivar);
      pendingAdminAccess.funcionDestino();
    }
    cerrarModalAdmin();
  } else {
    adminPasswordError.textContent = '❌ Contraseña incorrecta. Intenta de nuevo o usa recuperación.';
    adminPasswordError.classList.remove('hidden');
  }
}

function recuperarPorNacimiento() {
  const nacimientoRegistrado = datosSeguridadLocal && datosSeguridadLocal.nacimiento ? datosSeguridadLocal.nacimiento : "2026-01-01";
  const respuesta = prompt("🔐 Recuperación de contraseña. Ingresa tu fecha de nacimiento registrada (AAAA-MM-DD):");
  if (respuesta === null) return;
  if (respuesta.trim() === nacimientoRegistrado) {
    accesoConcedidoAdmin = true;
    adminPasswordError.classList.add('hidden');
    if (pendingAdminAccess) {
      activarBoton(pendingAdminAccess.botonActivar);
      pendingAdminAccess.funcionDestino();
    }
    cerrarModalAdmin();
  } else {
    adminPasswordError.textContent = '❌ Fecha de nacimiento incorrecta. Intenta nuevamente.';
    adminPasswordError.classList.remove('hidden');
  }
}

const isDesktopViewport = () => window.innerWidth >= 768;
const actualizarBotonSidebar = (abierto) => {
  if (!btnToggleSidebar) return;
  btnToggleSidebar.setAttribute('aria-expanded', String(abierto));
  const icono = btnToggleSidebar.querySelector('span.material-symbols-outlined');
  if (icono) icono.textContent = abierto ? 'menu_open' : 'menu';
};
const abrirSidebarMobile = () => {
  if (!sidebar) return;
  sidebar.classList.remove('-translate-x-full');
  sidebar.classList.add('translate-x-0');
  sidebarBackdrop?.classList.remove('hidden');
  actualizarBotonSidebar(true);
};
const cerrarSidebarMobile = () => {
  if (!sidebar) return;
  sidebar.classList.remove('translate-x-0');
  sidebar.classList.add('-translate-x-full');
  sidebarBackdrop?.classList.add('hidden');
  actualizarBotonSidebar(false);
};
const resetSidebarResponsive = () => {
  if (!sidebar) return;
  if (isDesktopViewport()) {
    sidebar.classList.remove('-translate-x-full', 'translate-x-0');
    sidebarBackdrop?.classList.add('hidden');
    actualizarBotonSidebar(true);
  }
};

const actualizarEstadoConexion = () => {
  const offline = !navigator.onLine;
  if (offline) {
    if (offlineBanner) {
      offlineBanner.textContent = 'No tienes conexión a internet. La app sigue funcionando y los cambios se guardan localmente hasta reconectar.';
      offlineBanner.classList.remove('hidden');
    }
    mostrarSnackbarMensaje('Sin internet: trabajando en modo offline. Los datos se guardan localmente.', 'info', 5000);
  } else {
    if (offlineBanner) {
      offlineBanner.classList.add('hidden');
    }
    mostrarSnackbarMensaje('Conexión restablecida. Los datos locales se sincronizarán automáticamente.', 'success', 4200);
  }
};
if (btnToggleSidebar && sidebar) {
  btnToggleSidebar.addEventListener('click', () => {
    if (sidebar.classList.contains('-translate-x-full')) {
      abrirSidebarMobile();
    } else {
      cerrarSidebarMobile();
    }
  });
}
const btnCloseSidebar = document.getElementById('btn-close-sidebar');
if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', cerrarSidebarMobile);
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', cerrarSidebarMobile);
window.addEventListener('resize', resetSidebarResponsive);
window.addEventListener('online', actualizarEstadoConexion);
window.addEventListener('offline', actualizarEstadoConexion);
window.addEventListener('load', () => {
  if (!isDesktopViewport()) {
    cerrarSidebarMobile();
  } else {
    resetSidebarResponsive();
  }
  actualizarEstadoConexion();
});
if (adminPasswordClose) adminPasswordClose.onclick = cerrarModalAdmin;
if (adminPasswordCancel) adminPasswordCancel.onclick = cerrarModalAdmin;
if (adminPasswordSubmit) adminPasswordSubmit.onclick = autorizarAccesoAdmin;
if (adminPasswordForgot) adminPasswordForgot.onclick = recuperarPorNacimiento;
if (adminPasswordInput) {
  adminPasswordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') autorizarAccesoAdmin();
  });
}

// =======================================================
// PANTALLA 1: PANEL PRINCIPAL
// =======================================================
function cargarPantallaUnificada() {
  apagarEscuchasActivos();
  document.getElementById('usuario-nombre').textContent = "Operador Rodeo";
  document.getElementById('usuario-rol').textContent = "Mostrador";

  let gridProductos = '';
  productosVentaRapida.forEach(prod => {
    const iconoClass = esEmoji(prod.icono) ? '' : 'material-symbols-outlined';
    gridProductos += `
      <button data-id="${prod.id}" class="btn-producto-click w-full min-h-[150px] flex flex-col items-center justify-center p-5 bg-white border border-zinc-200 rounded-3xl hover:border-[#D32F2F] transition-all transform active:scale-95 group shadow-sm">
        <div class="w-14 h-14 bg-zinc-100 group-hover:bg-red-50 rounded-2xl flex items-center justify-center text-zinc-700 group-hover:text-[#D32F2F] transition mb-3">
          <span class="${iconoClass} text-2xl">${prod.icono}</span>
        </div>
        <span class="font-bold text-zinc-800 text-xs tracking-tight text-center truncate w-full">${prod.nombre}</span>
        <span class="mt-1 text-[11px] px-2.5 py-0.5 bg-zinc-900 text-white rounded-full font-bold">$${prod.precio}</span>
      </button>
    `;
  });

  contenedorPantallas.innerHTML = `
    <div class="space-y-6">
      <div class="p-6 bg-white border border-zinc-200 rounded-3xl shadow-sm">
        <p class="text-[10px] font-bold text-zinc-400 tracking-wider uppercase">Ganancias de Hoy</p>
        <h3 class="text-4xl font-black text-zinc-900 mt-1" id="ganancias-hoy">$0.00</h3>
        <p class="text-[11px] text-zinc-400 mt-3">Suma de productos y membresías hoy.</p>
      </div>
      <div class="space-y-4">
        <div><h2 class="text-2xl font-black text-zinc-900 tracking-tight">Venta en un Clic</h2><p class="text-zinc-500 text-xs">Presiona cualquier producto para registrar el cobro inmediato.</p></div>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 auto-rows-fr">${gridProductos}</div>
        <div class="p-5 bg-[#FFF5F5] border border-red-100 rounded-3xl space-y-4 shadow-sm">
          <div class="flex items-center gap-2 text-[#D32F2F]"><span class="material-symbols-outlined font-bold text-xl">notifications_active</span><h3 class="font-black text-xs tracking-wider uppercase">Por Vencer (WhatsApp)</h3></div>
          <div class="space-y-3 max-h-[520px] overflow-y-auto pr-1" id="lista-alertas-vencimiento"></div>
        </div>
      </div>
    </div>
    <div id="snackbar-container" class="fixed bottom-6 right-6 z-50 space-y-2 pointer-events-none"></div>
  `;

  document.querySelectorAll('.btn-producto-click').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-id');
      const producto = productosVentaRapida.find(p => p.id === id);
      await registrarVentaExpress(producto);
    });
  });

  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
  const qVentas = query(collection(db, "ventas"), where("fecha", ">=", inicioHoy));
  desuscribirVentas = onSnapshot(qVentas, (snapshot) => {
    const txtGanancias = document.getElementById('ganancias-hoy'); if (!txtGanancias) return;
    let totalHoy = 0; snapshot.forEach((doc) => { totalHoy += doc.data().monto || 0; });
    txtGanancias.textContent = `$${totalHoy.toFixed(2)}`;
  });

  const hoy = new Date(); const limiteVencimiento = new Date(); limiteVencimiento.setDate(hoy.getDate() + 3);
  const qClientes = query(collection(db, "clientes"), where("fechaVencimiento", ">=", hoy), where("fechaVencimiento", "<=", limiteVencimiento));
  desuscribirClientes = onSnapshot(qClientes, (snapshot) => {
    const contenedorAlertas = document.getElementById('lista-alertas-vencimiento'); if (!contenedorAlertas) return;
    let tarjetasAlertas = '';
    if (snapshot.empty) { tarjetasAlertas = `<p class="text-xs text-zinc-400 text-center py-4">No hay membresías por vencer. 🙌</p>`; } 
    else {
      snapshot.forEach((doc) => {
        const cliente = doc.data(); const fVence = cliente.fechaVencimiento.toDate();
        const diasRestantes = Math.ceil((fVence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
        tarjetasAlertas += `<div class="flex items-center justify-between p-3.5 bg-white border border-red-50 rounded-2xl shadow-sm"><div class="overflow-hidden mr-2"><h4 class="font-bold text-zinc-800 text-xs truncate">${cliente.nombre}</h4><p class="text-[10px] text-zinc-500">Vence en <span class="text-[#D32F2F] font-bold">${diasRestantes} d</span></p></div><a href="https://api.whatsapp.com/send?phone=${cliente.telefono}" target="_blank" class="flex items-center justify-center w-8 h-8 bg-emerald-500 text-white rounded-full transition shrink-0 shadow-sm"><span class="material-symbols-outlined text-base">chat</span></a></div>`;
      });
    }
    contenedorAlertas.innerHTML = tarjetasAlertas;
  });
}

async function registrarVentaExpress(producto) {
  try {
    const docRef = await addDoc(collection(db, "ventas"), { tipo: producto.nombre === "Visita Gym" ? "membresia" : "producto", concepto: producto.nombre === "Visita Gym" ? `Visita Diaria: Mostrador` : producto.nombre, monto: producto.precio, fecha: serverTimestamp() });
    await marcarActividadDB();
    mostrarNotificacionDisenada(producto.nombre, producto.precio, docRef.id);
  } catch (error) { console.error(error); }
}

function mostrarNotificacionDisenada(nombre, precio, ventaId) {
  const container = document.getElementById('snackbar-container'); if (!container) return;
  const notificacion = document.createElement('div');
  notificacion.className = "pointer-events-auto flex items-center justify-between gap-4 bg-[#121212] text-zinc-100 px-5 py-3.5 rounded-2xl shadow-xl border border-zinc-800 min-w-[320px]";
  notificacion.innerHTML = `
    <div class="flex items-center gap-2.5">
      <span class="material-symbols-outlined text-[#D32F2F]">check_circle</span>
      <div>
        <p class="text-xs font-medium">Venta Registrada</p>
        <p class="text-[11px] text-zinc-400">${nombre}</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs font-black bg-zinc-800 px-2 py-1 rounded-lg text-white">$${precio}</span>
      <button class="cancel-venta text-xs text-red-400 bg-white/5 px-3 py-1 rounded-lg">Cancelar ↩️</button>
    </div>
  `;
  container.appendChild(notificacion);

  let removed = false;
  const timer = setTimeout(() => { if (!removed) { notificacion.remove(); } }, 3500);

  const btn = notificacion.querySelector('.cancel-venta');
  btn.addEventListener('click', async () => {
    if (removed) return;
    removed = true;
    clearTimeout(timer);
    try {
      await deleteDoc(doc(db, 'ventas', ventaId));
    await marcarActividadDB();
    } catch (err) { console.error('Error anulando venta:', err); }
    notificacion.remove();
    mostrarSnackbarMensaje('venta eliminada', 'info', 2800);
  });
}

function mostrarSnackbarMensaje(texto, variante = 'info', duracion = 2800) {
  const container = document.getElementById('snackbar-container'); if (!container) return;
  const wrap = document.createElement('div');
  wrap.className = 'pointer-events-auto flex items-center justify-between gap-4 px-4 py-2 rounded-2xl shadow-md min-w-[220px]';
  const paleta = {
    info: { bg: 'bg-[#121212]', text: 'text-zinc-100', accent: '#D32F2F' },
    success: { bg: 'bg-emerald-50', text: 'text-emerald-700', accent: '#059669' },
    error: { bg: 'bg-red-50', text: 'text-red-700', accent: '#B91C1C' }
  };
  const p = paleta[variante] || paleta.info;
  wrap.innerHTML = `<div class="flex items-center gap-3"><span class="h-8 w-8 flex items-center justify-center rounded-full" style="background:${p.accent}33"> <span class="material-symbols-outlined text-white text-sm">info</span></span><div class="text-sm font-medium ${p.text}">${texto}</div></div>`;
  wrap.style.background = variante === 'info' ? '#121212' : ''; // keep class backgrounds for others
  if (variante === 'info') { wrap.classList.add('bg-[#121212]','text-zinc-100'); }
  if (variante === 'success') { wrap.classList.add('bg-emerald-50','text-emerald-700'); }
  if (variante === 'error') { wrap.classList.add('bg-red-50','text-red-700'); }
  container.appendChild(wrap);
  setTimeout(() => { wrap.remove(); }, duracion);
}

function mostrarConfirmacion(texto) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl p-5 max-w-sm w-full text-center shadow-lg">
        <p class="text-sm text-zinc-700 mb-4">${texto}</p>
        <div class="flex justify-center gap-3">
          <button id="confirm-accept" class="px-4 py-2 rounded-xl bg-[#D32F2F] text-white font-bold">Aceptar</button>
          <button id="confirm-cancel" class="px-4 py-2 rounded-xl bg-zinc-100">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const clean = (valor) => { overlay.remove(); resolve(valor); };
    overlay.querySelector('#confirm-accept').addEventListener('click', () => clean(true));
    overlay.querySelector('#confirm-cancel').addEventListener('click', () => clean(false));
  });
}


// =======================================================
// PANTALLA 2: MEMBRESÍAS
// =======================================================
function cargarPantallaMembresiasMaster() {
  apagarEscuchasActivos();
  document.getElementById('usuario-nombre').textContent = "Operador Rodeo";
  document.getElementById('usuario-rol').textContent = "Mostrador";

  const stringFechaHTML = (d) => d.toISOString().split('T')[0];
  const hoyStr = stringFechaHTML(new Date());
  const unaSemanaDespues = new Date(); unaSemanaDespues.setDate(unaSemanaDespues.getDate() + 7);
  const unMesDespues = new Date(); unMesDespues.setDate(unMesDespues.getDate() + 30);

  contenedorPantallas.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start h-full pb-8">
      <div class="lg:col-span-1 space-y-6">
        <div class="space-y-4">
          <div class="flex items-center gap-2"><span class="material-symbols-outlined text-amber-500">calendar_view_week</span><h2 class="text-xl font-black text-zinc-900 tracking-tight uppercase">Semana</h2></div>
          <form id="form-semana" class="bg-white border border-zinc-200 p-5 rounded-3xl space-y-3 shadow-sm">
            <div><label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Nombre</label><input type="text" id="sem-nombre" required class="w-full px-4 py-2 bg-zinc-50 border rounded-xl outline-none text-xs font-medium"></div>
            <div><label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">WhatsApp</label><input type="tel" id="sem-telefono" required class="w-full px-4 py-2 bg-zinc-50 border rounded-xl outline-none text-xs font-medium"></div>
            <div class="grid grid-cols-2 gap-2">
              <div><label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Inicio</label><input type="date" id="sem-inicio" value="${hoyStr}" required class="w-full px-3 py-1.5 bg-zinc-50 border rounded-xl outline-none text-xs font-medium"></div>
              <div><label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Vence</label><input type="date" id="sem-vence" value="${stringFechaHTML(unaSemanaDespues)}" required class="w-full px-3 py-1.5 bg-zinc-50 border rounded-xl outline-none text-xs font-medium"></div>
            </div>
            <button type="submit" class="w-full py-2.5 bg-[#D32F2F] text-white font-bold text-xs rounded-xl shadow-md">COBRAR $${preciosMembresias.semana.toFixed(2)}</button>
          </form>
        </div>
        <div class="space-y-4 pt-2 border-t border-zinc-100">
          <div class="flex items-center gap-2"><span class="material-symbols-outlined text-emerald-500">calendar_month</span><h2 class="text-xl font-black text-zinc-900 tracking-tight uppercase">Mes Completo</h2></div>
          <form id="form-mes" class="bg-white border border-zinc-200 p-5 rounded-3xl space-y-3 shadow-sm">
            <div><label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Nombre</label><input type="text" id="mes-nombre" required class="w-full px-4 py-2 bg-zinc-50 border rounded-xl outline-none text-xs font-medium"></div>
            <div><label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">WhatsApp</label><input type="tel" id="mes-telefono" required class="w-full px-4 py-2 bg-zinc-50 border rounded-xl outline-none text-xs font-medium"></div>
            <div class="grid grid-cols-2 gap-2">
              <div><label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Inicio</label><input type="date" id="mes-inicio" value="${hoyStr}" required class="w-full px-3 py-1.5 bg-zinc-50 border rounded-xl outline-none text-xs font-medium"></div>
              <div><label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Vence</label><input type="date" id="mes-vence" value="${stringFechaHTML(unMesDespues)}" required class="w-full px-3 py-1.5 bg-zinc-50 border rounded-xl outline-none text-xs font-medium"></div>
            </div>
            <button type="submit" class="w-full py-2.5 bg-zinc-900 text-white font-bold text-xs rounded-xl shadow-md">COBRAR $${preciosMembresias.mes.toFixed(2)}</button>
          </form>
        </div>
      </div>

      <div class="lg:col-span-2 space-y-6">
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div><h2 class="text-xl font-black text-zinc-900 tracking-tight">Miembros Activos</h2></div>
            <input type="text" id="buscador-clientes" placeholder="Buscar por nombre..." class="pl-4 pr-4 py-1.5 bg-white border border-zinc-200 rounded-xl outline-none text-xs font-medium">
          </div>
          <div class="bg-white border rounded-3xl p-3 shadow-sm overflow-x-auto"><table class="w-full text-left text-xs"><tbody id="tabla-clientes-activos"></tbody></table></div>
        </div>
        <div class="space-y-3 pt-2">
          <h2 class="text-base font-black text-zinc-800 tracking-tight uppercase">Historial / Reincorporación Rápida</h2>
          <div class="bg-white border rounded-3xl p-3 shadow-sm overflow-x-auto"><table class="w-full text-left text-xs"><tbody id="tabla-clientes-historial"></tbody></table></div>
        </div>
      </div>
    </div>

    <div id="modal-reincorporar" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white w-full max-w-xs rounded-3xl p-5 space-y-4">
        <h3 id="reinc-target-name" class="font-black text-zinc-800 text-sm"></h3>
        <button id="btn-renovar-semana" class="w-full py-2.5 bg-amber-500 text-white text-xs rounded-xl font-bold">Renovar Semana ($${preciosMembresias.semana.toFixed(2)})</button>
        <button id="btn-renovar-mes" class="w-full py-2.5 bg-zinc-900 text-white text-xs rounded-xl font-bold">Renovar Mes ($${preciosMembresias.mes.toFixed(2)})</button>
        <button id="cerrar-reinc" class="w-full text-center text-xs text-zinc-400">Cancelar</button>
      </div>
    </div>
  `;

  const formSemana = document.getElementById('form-semana');
  const formMes = document.getElementById('form-mes');
  if (formSemana) {
    formSemana.onsubmit = async (event) => {
      event.preventDefault();
      const nombre = document.getElementById('sem-nombre').value.trim();
      const telefono = document.getElementById('sem-telefono').value.trim();
      const inicio = document.getElementById('sem-inicio').value;
      const vence = document.getElementById('sem-vence').value;
      if (!nombre || !telefono || !inicio || !vence) {
        mostrarSnackbarMensaje('Completa todos los campos para registrar la membresía.', 'error', 3200);
        return;
      }
      await registrarNuevaMembresia(nombre, telefono, 'semana', preciosMembresias.semana, inicio, vence);
      formSemana.reset();
    };
  }
  if (formMes) {
    formMes.onsubmit = async (event) => {
      event.preventDefault();
      const nombre = document.getElementById('mes-nombre').value.trim();
      const telefono = document.getElementById('mes-telefono').value.trim();
      const inicio = document.getElementById('mes-inicio').value;
      const vence = document.getElementById('mes-vence').value;
      if (!nombre || !telefono || !inicio || !vence) {
        mostrarSnackbarMensaje('Completa todos los campos para registrar la membresía.', 'error', 3200);
        return;
      }
      await registrarNuevaMembresia(nombre, telefono, 'mes', preciosMembresias.mes, inicio, vence);
      formMes.reset();
    };
  }

  let todosLosClientesCargados = []; let filtroBusquedaNombre = "";
  const renderTablasMembresias = () => {
    const tA = document.getElementById('tabla-clientes-activos'); const tH = document.getElementById('tabla-clientes-historial');
    if (!tA || !tH) return;
    tA.innerHTML = ''; tH.innerHTML = '';

    const filtrarCliente = (cliente) => {
      const textoBuscado = `${cliente.nombre || ''} ${cliente.telefono || ''} ${cliente.tipoMembresia || ''}`.toLowerCase();
      return !filtroBusquedaNombre || textoBuscado.includes(filtroBusquedaNombre);
    };

    const hoy = new Date();
    const clientesActivos = todosLosClientesCargados.filter((c) => {
      const fVence = c.fechaVencimiento.toDate();
      return fVence >= hoy && filtrarCliente(c);
    });
    const clientesHistorial = todosLosClientesCargados.filter((c) => {
      const fVence = c.fechaVencimiento.toDate();
      return fVence < hoy && filtrarCliente(c);
    });

    if (!clientesActivos.length) {
      tA.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-zinc-400">No hay clientes activos que coincidan con la búsqueda.</td></tr>`;
    } else {
      clientesActivos.forEach((c) => {
        const fVence = c.fechaVencimiento.toDate(); const fVenceStr = fVence.toLocaleDateString();
        tA.innerHTML += `<tr class="border-b hover:bg-zinc-50"><td class="py-3 pl-2 font-bold text-zinc-800">${c.nombre}</td><td><span class="px-2 py-0.5 border rounded-full font-bold text-[9px] uppercase bg-emerald-50 text-emerald-700">${c.tipoMembresia}</span></td><td>Vence: ${fVenceStr}</td></tr>`;
      });
    }

    if (!clientesHistorial.length) {
      tH.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-zinc-400">No hay clientes históricos que coincidan con la búsqueda.</td></tr>`;
    } else {
      clientesHistorial.forEach((c) => {
        const fVence = c.fechaVencimiento.toDate(); const fVenceStr = fVence.toLocaleDateString();
        tH.innerHTML += `<tr class="border-b text-zinc-400"><td class="py-2.5 pl-2 font-bold">${c.nombre}</td><td>Caducó: ${fVenceStr}</td><td class="text-right pr-2"><button data-id="${c.dbId}" data-name="${c.nombre}" data-tel="${c.telefono}" class="btn-trigger-reincorporar bg-zinc-900 text-white px-2 py-0.5 rounded-lg text-[10px]">Reincorporar</button></td></tr>`;
      });
    }

    document.querySelectorAll('.btn-trigger-reincorporar').forEach(btn => {
      btn.onclick = () => {
        document.getElementById('reinc-target-name').textContent = btn.getAttribute('data-name');
        document.getElementById('modal-reincorporar').classList.remove('hidden');
        const dbId = btn.getAttribute('data-id'); const nombre = btn.getAttribute('data-name'); const telefono = btn.getAttribute('data-tel');
        
        const ejecutarRenovacion = async (tipo, precio) => {
          const fNewVence = new Date(); fNewVence.setDate(fNewVence.getDate() + (tipo === 'semana' ? 7 : 30));
          await setDoc(doc(db, "clientes", dbId), { nombre, telefono, tipoMembresia: tipo, fechaVencimiento: fNewVence });
          await addDoc(collection(db, "ventas"), { tipo: "membresia", concepto: `Renovación: ${nombre}`, monto: precio, fecha: serverTimestamp() });
          await marcarActividadDB();
          document.getElementById('modal-reincorporar').classList.add('hidden');
        };
        document.getElementById('btn-renovar-semana').onclick = () => ejecutarRenovacion('semana', preciosMembresias.semana);
        document.getElementById('btn-renovar-mes').onclick = () => ejecutarRenovacion('mes', preciosMembresias.mes);
      };
    });
  };

  const buscadorClientes = document.getElementById('buscador-clientes');
  if (buscadorClientes) {
    buscadorClientes.addEventListener('input', (e) => {
      filtroBusquedaNombre = e.target.value.toLowerCase().trim();
      renderTablasMembresias();
    });
  }
  const cerrarReinc = document.getElementById('cerrar-reinc');
  if (cerrarReinc) cerrarReinc.onclick = () => document.getElementById('modal-reincorporar').classList.add('hidden');

  desuscribirClientes = onSnapshot(collection(db, "clientes"), (snapshot) => {
    todosLosClientesCargados = []; snapshot.forEach(doc => { todosLosClientesCargados.push({ dbId: doc.id, ...doc.data() }); });
    renderTablasMembresias();
  });

  const registrarNuevaMembresia = async (nombre, tel, tipo, precio, fInicioInput, fVenceInput) => {
    try {
      await addDoc(collection(db, "clientes"), { nombre, telefono: "52" + tel, tipoMembresia: tipo, fechaVencimiento: new Date(fVenceInput + "T23:59:59") });
      await addDoc(collection(db, "ventas"), { tipo: "membresia", concepto: `Inscripción ${tipo.toUpperCase()}: ${nombre}`, monto: precio, fecha: serverTimestamp() });
      await marcarActividadDB();
      mostrarSnackbarMensaje('¡Guardado!', 'success', 2500);
    } catch (e) { console.error(e); }
  };
}


// =======================================================
// PANTALLA 3: DINÁMICAS (RULETA)
// =======================================================
function cargarPantallaDinamicas() {
  apagarEscuchasActivos();
  document.getElementById('usuario-nombre').textContent = "Operador Rodeo";
  document.getElementById('usuario-rol').textContent = "Mostrador";

  contenedorPantallas.innerHTML = `
    <div class="relative min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center gap-6 select-none overflow-hidden px-4 py-6">
      <button id="btn-config-ruleta" class="absolute top-4 right-4 p-3 text-zinc-400 hover:text-[#D32F2F] transition"><span class="material-symbols-outlined text-3xl">settings</span></button>
      <div class="text-center w-full max-w-xl">
        <h2 class="text-3xl font-black text-zinc-900 tracking-tight">Ruleta My Fit Gym</h2>
        <p class="text-zinc-500 text-xs">¡Gira y descubre tu premio de hoy!</p>
      </div>
      <div class="flex w-full max-w-[620px] flex-col items-center justify-center gap-6">
        <div class="relative w-[320px] h-[320px] md:w-[450px] md:h-[450px]">
          <div class="absolute -top-3 left-1/2 -translate-x-1/2 z-20 w-8 h-8 bg-zinc-900" style="clip-path: polygon(100% 0, 0 0, 50% 100%);"></div>
          <canvas id="canvas-ruleta" width="600" height="600" class="w-full h-full rounded-full shadow-2xl border-8 border-zinc-900 bg-zinc-900"></canvas>
          <button id="btn-girar" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-16 h-16 md:w-20 md:h-20 bg-zinc-900 border-4 border-white text-white rounded-full font-black text-xs md:text-sm tracking-wider shadow-xl">GIRAR</button>
        </div>
        <div id="resultado-premio" class="w-full max-w-xs text-center text-xl font-black text-[#D32F2F] uppercase tracking-widest opacity-0"></div>
      </div>
      <div id="modal-config" class="hidden fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
        <div class="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
          <div class="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 class="text-xl font-black text-zinc-900">Configuración de la Ruleta</h3>
              <p class="text-xs text-zinc-500">Edita premios, emojis, colores y porcentajes. El total debe ser 100%.</p>
            </div>
            <button id="btn-close-config" type="button" class="text-zinc-400 hover:text-zinc-800 text-xl font-bold">✕</button>
          </div>
          <div class="grid gap-3 sm:grid-cols-[1fr_auto] items-end mb-4">
            <div class="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
              <p class="text-[10px] uppercase tracking-[0.2em] font-semibold text-zinc-500">Total de porcentajes</p>
              <p id="config-ruleta-total" class="mt-2 text-2xl font-black text-zinc-900">0%</p>
              <p id="config-ruleta-warning" class="mt-2 text-xs text-red-600 hidden">La suma debe ser exactamente 100% para guardar.</p>
            </div>
            <div class="space-y-2 text-right">
              <button id="btn-add-ruleta-item" type="button" class="w-full rounded-2xl bg-zinc-900 py-3 text-sm font-bold text-white hover:bg-zinc-800 transition">Añadir premio</button>
              <button id="btn-reset-ruleta-colors" type="button" class="w-full rounded-2xl bg-zinc-100 py-3 text-sm font-bold text-zinc-900 hover:bg-zinc-200 transition">Reiniciar colores</button>
              <button id="btn-save-ruleta-config" type="button" class="w-full rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition">Guardar cambios</button>
            </div>
          </div>
          <div class="overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
            <div id="config-ruleta-list" class="space-y-3"></div>
          </div>
          <datalist id="emoji-options">
            ${listaEmojisDisponibles.map((emoji) => `<option value="${emoji}"></option>`).join('')}
          </datalist>
        </div>
      </div>
    </div>
  `;

  const canvas = document.getElementById('canvas-ruleta'); const ctx = canvas.getContext('2d');
  const modal = document.getElementById('modal-config');
  
  const dibujarRuleta = () => {
    const arco = (2 * Math.PI) / Math.max(configuracionRuleta.length, 1);
    let anguloInicio = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    configuracionRuleta.forEach((op) => {
      ctx.beginPath();
      ctx.fillStyle = op.color;
      ctx.moveTo(300, 300);
      ctx.arc(300, 300, 300, anguloInicio, anguloInicio + arco);
      ctx.fill();
      ctx.save();
      ctx.translate(300, 300);
      const anguloMedio = anguloInicio + arco / 2;
      ctx.rotate(anguloMedio);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px sans-serif";
      const anguloGrados = (anguloMedio * 180) / Math.PI;
      if (anguloGrados > 90 && anguloGrados < 270) {
        ctx.translate(260, 0);
        ctx.rotate(Math.PI);
        ctx.textAlign = "left";
        ctx.fillText(`${op.icono} ${op.premio}`, -10, 6);
      } else {
        ctx.textAlign = "right";
        ctx.fillText(`${op.icono} ${op.premio}`, 260, 6);
      }
      ctx.restore();
      anguloInicio += arco;
    });
  };
  dibujarRuleta();

  const btnConfigRuleta = document.getElementById('btn-config-ruleta');
  const btnCloseConfig = document.getElementById('btn-close-config');
  const btnSaveConfig = document.getElementById('btn-save-ruleta-config');
  const btnResetColors = document.getElementById('btn-reset-ruleta-colors');
  const btnAddRuletaItem = document.getElementById('btn-add-ruleta-item');
  const configList = document.getElementById('config-ruleta-list');
  const totalDisplay = document.getElementById('config-ruleta-total');
  const warningTotal = document.getElementById('config-ruleta-warning');

  const actualizarTotalConfiguracion = () => {
    const total = configuracionRuleta.reduce((sum, item) => sum + Number(item.probabilidad || 0), 0);
    totalDisplay.textContent = `${total}%`;
    if (total !== 100) {
      warningTotal.classList.remove('hidden');
      totalDisplay.classList.add('text-red-600');
      totalDisplay.classList.remove('text-zinc-900');
    } else {
      warningTotal.classList.add('hidden');
      totalDisplay.classList.remove('text-red-600');
      totalDisplay.classList.add('text-zinc-900');
    }
    return total;
  };

  const renderConfigRuleta = () => {
    if (!configList) return;
    configList.innerHTML = configuracionRuleta.map((item, index) => `
      <div class="grid grid-cols-[1fr_0.8fr_0.7fr_0.6fr_0.2fr] gap-2 items-center rounded-2xl border border-zinc-200 bg-white p-3">
        <input data-field="premio" data-index="${index}" value="${item.premio}" class="w-full rounded-2xl border border-zinc-200 px-3 py-2 text-xs" placeholder="Premio" />
        <input list="emoji-options" data-field="icono" data-index="${index}" value="${item.icono}" class="rounded-2xl border border-zinc-200 px-3 py-2 text-xs" placeholder="Emoji" />
        <input type="number" min="0" max="100" data-field="probabilidad" data-index="${index}" value="${item.probabilidad}" class="rounded-2xl border border-zinc-200 px-3 py-2 text-xs text-center" />
        <input type="color" data-field="color" data-index="${index}" value="${item.color}" class="h-10 w-full rounded-2xl border border-zinc-200 p-1" title="Color" />
        <button type="button" data-delete-index="${index}" class="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">Eliminar</button>
      </div>
    `).join('');
    configList.querySelectorAll('[data-delete-index]').forEach((btn) => {
      btn.onclick = () => {
        const index = Number(btn.getAttribute('data-delete-index'));
        configuracionRuleta.splice(index, 1);
        renderConfigRuleta();
        actualizarTotalConfiguracion();
        dibujarRuleta();
      };
    });
    configList.querySelectorAll('[data-field]').forEach((input) => {
      input.oninput = () => {
        const field = input.getAttribute('data-field');
        const index = Number(input.getAttribute('data-index'));
        if (Number.isFinite(index) && configuracionRuleta[index]) {
          configuracionRuleta[index][field] = field === 'probabilidad' ? Number(input.value) : input.value;
          actualizarTotalConfiguracion();
          dibujarRuleta();
        }
      };
    });
    actualizarTotalConfiguracion();
    dibujarRuleta();
  };

  const openConfigModal = () => {
    if (modal) modal.classList.remove('hidden');
    renderConfigRuleta();
  };
  const closeConfigModal = () => {
    if (modal) modal.classList.add('hidden');
  };

  if (btnConfigRuleta) btnConfigRuleta.onclick = openConfigModal;
  if (btnCloseConfig) btnCloseConfig.onclick = closeConfigModal;
  const resetRuletaColors = () => {
    configuracionRuleta.forEach((item, index) => {
      item.color = coloresGymVibrantes[index % coloresGymVibrantes.length];
    });
    renderConfigRuleta();
    dibujarRuleta();
    mostrarSnackbarMensaje('Colores de la ruleta reiniciados.', 'success', 2600);
  };

  if (btnAddRuletaItem) btnAddRuletaItem.onclick = () => {
    configuracionRuleta.push({ premio: 'Nuevo premio', icono: '✨', color: coloresGymVibrantes[configuracionRuleta.length % coloresGymVibrantes.length], probabilidad: 0 });
    renderConfigRuleta();
  };
  if (btnResetColors) btnResetColors.onclick = resetRuletaColors;
  if (btnSaveConfig) btnSaveConfig.onclick = () => {
    const total = actualizarTotalConfiguracion();
    if (total !== 100) {
      mostrarSnackbarMensaje('La configuración de ruleta debe sumar exactamente 100%.', 'error', 3200);
      return;
    }
    renderConfigRuleta();
    dibujarRuleta();
    closeConfigModal();
    mostrarSnackbarMensaje('Configuración de ruleta guardada.', 'success', 2600);
  };

  let g = false;
  let currentRotation = 0;
  document.getElementById('btn-girar').onclick = () => {
    if (g) return; g = true; const txt = document.getElementById('resultado-premio'); txt.classList.add('opacity-0');
    const totalSum = configuracionRuleta.reduce((sum, item) => sum + Number(item.probabilidad || 0), 0);
    if (totalSum !== 100) {
      mostrarSnackbarMensaje('No se puede girar: la ruleta debe sumar 100%.', 'error', 3200);
      g = false;
      return;
    }
    let r = Math.random() * totalSum;
    let acumulado = 0;
    let iG = 0;
    for (let i = 0; i < configuracionRuleta.length; i++) {
      acumulado += Number(configuracionRuleta[i].probabilidad || 0);
      if (r <= acumulado) {
        iG = i;
        break;
      }
    }
    const calcularAnguloCentro = (index) => {
      const segmentos = configuracionRuleta.length || 1;
      const arco = 360 / segmentos;
      return index * arco + arco / 2;
    };
    const anguloCentro = calcularAnguloCentro(iG);
    const objetivoModulo = ((270 - anguloCentro) % 360 + 360) % 360;
    const rotacionActualModulo = ((currentRotation % 360) + 360) % 360;
    const delta = ((objetivoModulo - rotacionActualModulo + 360) % 360);
    const rot = currentRotation + (6 * 360) + delta;
    currentRotation = rot;
    canvas.style.transition = "transform 4.5s cubic-bezier(0.15, 0.85, 0.15, 1)";
    canvas.style.transform = `rotate(${rot}deg)`;
    setTimeout(() => {
      g = false;
      canvas.style.transition = "none";
      txt.innerHTML = `🎁 GANASTE: ${configuracionRuleta[iG].premio}`;
      txt.classList.remove('opacity-0');
      if (window.confetti) window.confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
    }, 4500);
  };
}


// =======================================================
// ZONA ADMINISTRATIVA PROTEGIDA POR CONTRASEÑA
// =======================================================
function validarAccesoAdmin(funcionDestino, botonActivar) {
  if (accesoConcedidoAdmin) {
    activarBoton(botonActivar); funcionDestino(); return;
  }
  abrirModalAdmin(funcionDestino, botonActivar);
}

function cargarPantallaEstadisticas() {
  if (desuscribirDashboard) { desuscribirDashboard(); desuscribirDashboard = null; }
  document.getElementById('usuario-nombre').textContent = "Dueño Rodeo";
  document.getElementById('usuario-rol').textContent = "Administrador";

  contenedorPantallas.innerHTML = `
    <div class="space-y-6 pb-8">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 class="text-2xl font-black">Estadisticas de My Fit Gym</h2><p class="text-zinc-500 text-xs">Inteligencia de caja calculada desde Firestore.</p></div>
        <div class="inline-flex p-1 bg-zinc-100 rounded-2xl border text-xs font-bold">
          <button id="slicer-hoy" class="px-3 py-1.5 rounded-xl transition-all">HOY</button>
          <button id="slicer-semana" class="px-3 py-1.5 rounded-xl transition-all">SEMANA</button>
          <button id="slicer-mes" class="px-3 py-1.5 rounded-xl transition-all">MES</button>
          <button id="slicer-anio" class="px-3 py-1.5 rounded-xl transition-all">AÑO</button>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-center">
        <div class="p-5 bg-white border rounded-3xl shadow-sm"><p class="text-[10px] font-bold text-zinc-400 uppercase">Facturación Total</p><h3 class="text-2xl font-black mt-1" id="kpi-ingreso-mes">$0.00</h3></div>
        <div class="p-5 bg-white border rounded-3xl shadow-sm"><p class="text-[10px] font-bold text-zinc-400 uppercase">Miembros Activos</p><h3 class="text-2xl font-black mt-1" id="kpi-miembros-activos">0</h3></div>
        <div class="p-5 bg-white border rounded-3xl shadow-sm"><p class="text-[10px] font-bold text-zinc-400 uppercase">Suplementos</p><h3 class="text-2xl font-black mt-1" id="kpi-productos-monto">$0.00</h3></div>
        <div class="p-5 bg-white border rounded-3xl shadow-sm"><p class="text-[10px] font-bold text-zinc-400 uppercase">Ticket Promedio</p><h3 class="text-2xl font-black mt-1" id="kpi-ticket-promedio">$0.00</h3></div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 p-5 bg-white border rounded-3xl h-[280px] relative overflow-hidden">
          <div id="loader-linea" class="absolute inset-0 z-10 grid place-items-center bg-white/80 text-sm font-semibold text-zinc-600">
            <div class="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 shadow-sm">
              <span class="h-3 w-3 animate-spin rounded-full border-2 border-red-500 border-t-transparent"></span>
              Generando métricas...
            </div>
          </div>
          <canvas id="chart-linea-ingresos" class="h-full w-full"></canvas>
        </div>
        <div class="p-5 bg-white border rounded-3xl h-[280px] relative overflow-hidden">
          <div id="loader-dona" class="absolute inset-0 z-10 grid place-items-center bg-white/80 text-sm font-semibold text-zinc-600">
            <div class="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 shadow-sm">
              <span class="h-3 w-3 animate-spin rounded-full border-2 border-red-500 border-t-transparent"></span>
              Generando métricas...
            </div>
          </div>
          <canvas id="chart-dona-mix" class="h-full w-full"></canvas>
        </div>
      </div>
      <div class="bg-white border rounded-3xl p-4 shadow-sm">
        <h3 class="text-sm font-bold text-zinc-900 uppercase mb-3">Últimas 5 operaciones</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="text-zinc-500 uppercase border-b border-zinc-200">
                <tr>
                  <th class="py-3 pr-3">Fecha</th>
                  <th class="py-3 pr-3">Concepto</th>
                  <th class="py-3 pr-3">Tipo</th>
                  <th class="py-3 pr-3 text-right">Monto</th>
                  <th class="py-3 text-right">Acción</th>
                </tr>
            </thead>
            <tbody id="tabla-dashboard-ventas"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const btnHoy = document.getElementById('slicer-hoy');
  const btnSemana = document.getElementById('slicer-semana');
  const btnMes = document.getElementById('slicer-mes');
  const btnAnio = document.getElementById('slicer-anio');
  const tablaVentas = document.getElementById('tabla-dashboard-ventas');

  const obtenerInicioPeriodo = (periodo) => {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0, 0);
    switch (periodo) {
      case 'hoy':
        return inicio;
      case 'semana': {
        const semana = new Date(inicio);
        semana.setDate(semana.getDate() - 7);
        return semana;
      }
      case 'mes':
        return new Date(inicio.getFullYear(), inicio.getMonth(), 1, 0, 0, 0, 0);
      case 'anio':
        return new Date(inicio.getFullYear(), 0, 1, 0, 0, 0, 0);
      default:
        return inicio;
    }
  };

  const formatearMoneda = (valor) => `$${valor.toFixed(2)}`;

  const establecerBotonActivo = (activo) => {
    [btnHoy, btnSemana, btnMes, btnAnio].forEach((boton) => {
      if (!boton) return;
      if (boton.id === `slicer-${activo}`) {
        boton.classList.add('bg-zinc-900', 'text-white');
      } else {
        boton.classList.remove('bg-zinc-900', 'text-white');
      }
    });
  };

  const renderTablaVentas = (ventas) => {
    if (!tablaVentas) return;
    if (!ventas.length) {
      tablaVentas.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-zinc-400">No hay operaciones en este rango.</td></tr>`;
      return;
    }
    tablaVentas.innerHTML = ventas.map((venta) => `
      <tr class="border-b border-zinc-100 odd:bg-zinc-50/50 hover:bg-red-50/30 transition-colors">
        <td class="py-3 pr-3">${venta.fecha.toLocaleString()}</td>
        <td class="py-3 pr-3">${venta.concepto}</td>
        <td class="py-3 pr-3">${venta.tipo}</td>
        <td class="py-3 pr-3 text-right">${formatearMoneda(venta.monto)}</td>
        <td class="py-3 pr-3 text-right"><button data-id="${venta.id}" class="anular-venta text-xs text-red-600 bg-red-50 px-2 py-1 rounded-md">Anular Venta 🗑️</button></td>
      </tr>
    `).join('');

    // attach handlers for anular
    tablaVentas.querySelectorAll('.anular-venta').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!(await mostrarConfirmacion('¿Confirmas anular esta venta? Esta acción eliminará la transacción.'))) return;
        try {
          await deleteDoc(doc(db, 'ventas', id));
          await marcarActividadDB();
          mostrarSnackbarMensaje('venta eliminada', 'info', 2800);
        } catch (err) { console.error('Error al anular venta', err); mostrarSnackbarMensaje('no se pudo anular la venta', 'error', 3000); }
      });
    });
  };

  const ventasCache = [];

  const actualizarDashboard = () => {
    const fechaDesde = obtenerInicioPeriodo(filtroTemporalActual);
    let total = 0;
    let prod = 0;
    let mbs = 0;
    let transacciones = 0;

    const ventasFiltradas = ventasCache.filter((venta) => venta.fecha >= fechaDesde);
    ventasFiltradas.forEach((venta) => {
      total += venta.monto;
      if (venta.tipo === 'producto') prod += venta.monto;
      if (venta.tipo === 'membresia') mbs += venta.monto;
      transacciones += 1;
    });

    const ticketPromedio = transacciones > 0 ? total / transacciones : 0;
    const ventasOrdenadas = [...ventasFiltradas].sort((a, b) => b.fecha - a.fecha);
    const ultimasVentas = ventasOrdenadas.slice(0, 5);
    const ventasGrafico = [...ventasFiltradas].sort((a, b) => a.fecha - b.fecha).slice(-7);

    const kpiIngreso = document.getElementById('kpi-ingreso-mes');
    const kpiProductos = document.getElementById('kpi-productos-monto');
    const kpiTicket = document.getElementById('kpi-ticket-promedio');

    if (kpiIngreso) kpiIngreso.textContent = formatearMoneda(total);
    if (kpiProductos) kpiProductos.textContent = formatearMoneda(prod);
    if (kpiTicket) kpiTicket.textContent = formatearMoneda(ticketPromedio);

    if (window.Chart) {
      const ctxL = document.getElementById('chart-linea-ingresos');
      const loaderLinea = document.getElementById('loader-linea');
      if (ctxL) {
        if (chartLineaAdmin) { chartLineaAdmin.destroy(); chartLineaAdmin = null; }
        // Top de Productos Más Vendidos (conteo por concepto)
        const contador = {};
        ventasFiltradas.forEach(v => {
          const key = v.concepto || 'Otros';
          contador[key] = (contador[key] || 0) + 1;
        });
        const ordenado = Object.keys(contador).map(k => ({ k, c: contador[k] })).sort((a,b) => b.c - a.c).slice(0, 7);
        const labelsTop = ordenado.map(o => o.k);
        const dataTop = ordenado.map(o => o.c);

        const gradient = ctxL.getContext('2d').createLinearGradient(0, 0, 0, 280);
        gradient.addColorStop(0, '#D32F2F');
        gradient.addColorStop(1, '#7F1D1D');
        chartLineaAdmin = new Chart(ctxL, {
          type: 'bar',
          data: {
            labels: labelsTop,
            datasets: [{ data: dataTop, backgroundColor: gradient, borderRadius: 8, borderSkipped: false }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 500, easing: 'easeOutQuart' },
            layout: { padding: { top: 10, bottom: 10, left: 10, right: 10 } },
            plugins: {
              legend: { display: false },
              tooltip: { mode: 'index', intersect: false, position: 'nearest' },
              title: { display: true, text: 'Productos más vendidos', font: { size: 14 }, padding: { top: 10, bottom: 10 } }
            },
            scales: {
              x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0, font: { size: 10 } } },
              y: { grid: { color: '#F4F4F5' }, ticks: { precision: 0, callback: (value) => `$${value}`, font: { size: 10 } } }
            }
          }
        });
        if (loaderLinea) loaderLinea.classList.add('hidden');
      }

      const ctxD = document.getElementById('chart-dona-mix');
      const loaderDona = document.getElementById('loader-dona');
      if (ctxD) {
        if (chartDonaAdmin) { chartDonaAdmin.destroy(); chartDonaAdmin = null; }
        chartDonaAdmin = new Chart(ctxD, {
          type: 'doughnut',
          data: {
            labels: ['Membresías', 'Productos'],
            datasets: [{ data: [mbs, prod], backgroundColor: ['#D32F2F', '#111111'], borderWidth: 0 }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            animation: { duration: 500, easing: 'easeOutQuart' },
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  boxWidth: 14,
                  font: { weight: '600', size: 10 },
                  padding: 10,
                  usePointStyle: true
                }
              },
              tooltip: {
                callbacks: {
                  label: (context) => `${context.label}: $${context.parsed}`
                }
              },
              title: { display: true, text: 'Ventas por tipo', font: { size: 14 }, padding: { top: 10, bottom: 10 } }
            }
          }
        });
        if (loaderDona) loaderDona.classList.add('hidden');
      }
    }

    // Render all transacciones en el periodo seleccionado
    renderTablaVentas(ventasOrdenadas);
  };

  const actualizarFiltro = (periodo) => {
    filtroTemporalActual = periodo;
    establecerBotonActivo(periodo);
    actualizarDashboard();
  };

  if (btnHoy) btnHoy.onclick = () => actualizarFiltro('hoy');
  if (btnSemana) btnSemana.onclick = () => actualizarFiltro('semana');
  if (btnMes) btnMes.onclick = () => actualizarFiltro('mes');
  if (btnAnio) btnAnio.onclick = () => actualizarFiltro('anio');

  establecerBotonActivo(filtroTemporalActual);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0, 0);

  const clientesUnsub = onSnapshot(query(collection(db, 'clientes'), where('fechaVencimiento', '>=', hoy)), (snap) => {
    const kpiClientes = document.getElementById('kpi-miembros-activos');
    if (kpiClientes) kpiClientes.textContent = `${snap.size}`;
  });

  const ventasUnsub = onSnapshot(collection(db, 'ventas'), (snap) => {
    ventasCache.length = 0;
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const fecha = data.fecha && typeof data.fecha.toDate === 'function' ? data.fecha.toDate() : data.fecha ? new Date(data.fecha) : null;
      if (!fecha) return;
      ventasCache.push({
        id: docSnap.id,
        fecha,
        monto: Number(data.monto) || 0,
        tipo: data.tipo || 'producto',
        concepto: data.concepto || 'Venta'
      });
    });
    actualizarDashboard();
  });

  desuscribirDashboard = () => {
    ventasUnsub();
    clientesUnsub();
    desuscribirDashboard = null;
  };
}

function cargarPantallaRoles() {
  if (desuscribirDashboard) { desuscribirDashboard(); desuscribirDashboard = null; }
  document.getElementById('usuario-nombre').textContent = "Dueño Rodeo";
  document.getElementById('usuario-rol').textContent = "Administrador";

  contenedorPantallas.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-2xl font-black">Catálogo Editable</h2>
          <p class="text-zinc-500 text-xs">Actualiza precios al vuelo para que el panel principal use los nuevos valores.</p>
        </div>
        <div class="flex items-center gap-3">
          <button id="btn-agregar-producto" class="text-xs bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl font-bold">Agregar Producto ➕</button>
          <div id="roles-feedback" class="hidden rounded-3xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-700"></div>
        </div>
      </div>
      <div id="form-agregar-producto" class="hidden bg-white border border-zinc-100 rounded-2xl p-4 shadow-sm">
        <div class="grid grid-cols-3 gap-2 items-end">
          <div><label class="text-[10px] text-zinc-400">Nombre</label><input id="ap-nombre" class="w-full px-3 py-2 rounded-xl bg-zinc-50 text-xs" /></div>
          <div><label class="text-[10px] text-zinc-400">Precio</label><input id="ap-precio" type="number" min="0" class="w-full px-3 py-2 rounded-xl bg-zinc-50 text-xs" /></div>
          <div>
            <label class="text-[10px] text-zinc-400">Icono</label>
            <select id="ap-icono" class="w-full px-3 py-2 rounded-xl bg-zinc-50 text-xs border border-zinc-200">
              ${iconosGymSeleccion.map((icono) => `<option value="${icono.valor}">${icono.valor} ${icono.etiqueta}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="mt-3 flex gap-2"><button id="ap-guardar" class="px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm">Agregar</button><button id="ap-cancelar" class="px-3 py-2 rounded-xl bg-zinc-100 text-sm">Cancelar</button></div>
      </div>
      <div class="bg-white border border-zinc-100 overflow-hidden rounded-2xl p-4 shadow-sm overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="text-zinc-500 uppercase border-b border-zinc-200">
            <tr>
              <th class="py-3 pr-4">Producto</th>
              <th class="py-3 pr-4">Emoji</th>
              <th class="py-3 pr-4">Precio</th>
              <th class="py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody id="tabla-productos-editables"></tbody>
        </table>
      </div>
    </div>
  `;

  const tablaProductos = document.getElementById('tabla-productos-editables');
  const feedback = document.getElementById('roles-feedback');

  const mostrarFeedback = (mensaje) => {
    if (!feedback) { mostrarSnackbarMensaje(mensaje, 'info', 2800); return; }
    feedback.textContent = mensaje;
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 2800);
  };

  const renderProductos = () => {
    if (!tablaProductos) return;
    const itemsEditables = [
      { id: 'memb-semana', nombre: 'Membresía Semana', precio: preciosMembresias.semana, icono: '', esMembresia: true, membresiaKey: 'semana' },
      { id: 'memb-mes', nombre: 'Membresía Mes', precio: preciosMembresias.mes, icono: '', esMembresia: true, membresiaKey: 'mes' },
      ...productosVentaRapida.map((producto) => ({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        icono: producto.icono || '',
        esMembresia: false
      }))
    ];

    tablaProductos.innerHTML = itemsEditables.map((item, index) => `
      <tr class="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
        <td class="py-3 pr-4 align-top text-sm font-medium">${item.nombre}</td>
        <td class="py-3 pr-4 align-top text-sm font-medium">
          ${item.icono ? `<span class="text-xl ${esEmoji(item.icono) ? '' : 'material-symbols-outlined'}">${item.icono}</span>` : '<span class="text-zinc-400">—</span>'}
        </td>
        <td class="py-3 pr-4 align-top">
          <input type="number" min="0" step="1" value="${item.precio}" data-item-id="${item.id}" data-membresia-key="${item.membresiaKey || ''}" class="precio-producto w-full bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-[#D32F2F] transition-all px-4 py-2 text-center font-bold rounded-xl appearance-none text-xs" />
        </td>
        <td class="py-3 text-right align-top">
          <div class="inline-flex gap-2 items-center justify-end">
            <button type="button" data-item-id="${item.id}" data-membresia-key="${item.membresiaKey || ''}" class="guardar-precio transform active:scale-95 hover:bg-zinc-800 shadow-sm flex items-center justify-center gap-1.5 rounded-2xl bg-zinc-900 px-3 py-2 text-white text-xs font-bold transition-all">Guardar 💾</button>
            ${item.esMembresia ? '' : `<button type="button" data-item-id="${item.id}" class="eliminar-producto text-xs text-red-600 bg-red-50 px-3 py-2 rounded-2xl">Eliminar 🗑️</button>`}
          </div>
        </td>
      </tr>
    `).join('');

    tablaProductos.querySelectorAll('.guardar-precio').forEach((boton) => {
      boton.addEventListener('click', () => {
        const itemId = boton.dataset.itemId;
        const membresiaKey = boton.dataset.membresiaKey;
        const input = tablaProductos.querySelector(`input[data-item-id="${itemId}"]`);
        const nuevoPrecio = Number(input?.value);
        if (Number.isNaN(nuevoPrecio) || nuevoPrecio < 0) {
          mostrarSnackbarMensaje('Ingresa un precio válido para el producto.', 'error', 3000);
          return;
        }
        if (membresiaKey) {
          preciosMembresias[membresiaKey] = nuevoPrecio;
          mostrarFeedback(`Precio de ${membresiaKey === 'semana' ? 'Membresía Semana' : 'Membresía Mes'} actualizado a $${nuevoPrecio}.`);
        } else {
          const index = productosVentaRapida.findIndex((p) => p.id === itemId);
          if (index !== -1) {
            productosVentaRapida[index].precio = nuevoPrecio;
            mostrarFeedback(`Precio de ${productosVentaRapida[index].nombre} actualizado a $${nuevoPrecio}.`);
          }
        }
        mostrarSnackbarMensaje('Precio actualizado. Al volver al panel principal o a Membresías se usarán los nuevos valores.', 'success', 3000);
      });
    });

    tablaProductos.querySelectorAll('.eliminar-producto').forEach((boton) => {
      boton.addEventListener('click', async () => {
        const itemId = boton.dataset.itemId;
        const index = productosVentaRapida.findIndex((p) => p.id === itemId);
        if (index === -1) return;
        if (!(await mostrarConfirmacion(`¿Eliminar ${productosVentaRapida[index].nombre}? Esta acción es permanente.`))) return;
        const eliminado = productosVentaRapida.splice(index, 1);
        renderProductos();
        mostrarSnackbarMensaje(`Producto eliminado: ${eliminado[0].nombre}. Al volver al panel principal, los botones se actualizarán.`, 'info', 3000);
      });
    });

    // agregar producto handlers
    const btnAgregar = document.getElementById('btn-agregar-producto');
    const formAgregar = document.getElementById('form-agregar-producto');
    const apGuardar = document.getElementById('ap-guardar');
    const apCancelar = document.getElementById('ap-cancelar');
    if (btnAgregar) btnAgregar.onclick = () => { if (formAgregar) formAgregar.classList.toggle('hidden'); };
    if (apCancelar) apCancelar.onclick = () => { if (formAgregar) formAgregar.classList.add('hidden'); };
    if (apGuardar) apGuardar.onclick = () => {
      const nombre = document.getElementById('ap-nombre').value.trim();
      const precio = Number(document.getElementById('ap-precio').value);
      const icono = document.getElementById('ap-icono').value.trim() || '';
      if (!nombre || Number.isNaN(precio) || precio < 0) { mostrarSnackbarMensaje('Nombre y precio válidos son requeridos.', 'error', 3000); return; }
      const nuevo = { id: Date.now().toString(), nombre, precio, icono };
      productosVentaRapida.push(nuevo);
      renderProductos();
      if (formAgregar) formAgregar.classList.add('hidden');
      mostrarSnackbarMensaje(`Producto agregado: ${nombre}. Al volver al panel principal, los botones se actualizarán.`, 'success', 3000);
    };
  };

  renderProductos();
}

function cargarPantallaSeguridad() {
  apagarEscuchasActivos();
  document.getElementById('usuario-nombre').textContent = "Dueño Rodeo";
  document.getElementById('usuario-rol').textContent = "Administrador";

  contenedorPantallas.innerHTML = `
    <div class="max-w-md mx-auto mt-8 space-y-4 select-none">
      <div class="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
        <div class="flex items-center gap-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 shadow-sm">
            <span class="text-2xl">🔒</span>
          </div>
          <div>
            <h2 class="text-2xl font-black">Ajustes de Llave Maestra</h2>
            <p class="text-zinc-500 text-xs">Actualización de PIN institucional corporativo.</p>
          </div>
        </div>
        <form id="form-admin-security" class="mt-6 space-y-4">
          <div>
            <label class="block text-[10px] font-bold text-zinc-400 mb-2">Contraseña Nueva</label>
            <input type="password" id="new-p" required class="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-[#D32F2F] transition-all" />
          </div>
          <button type="submit" class="w-full rounded-2xl bg-zinc-900 py-3 text-sm font-bold text-white shadow-md transition hover:bg-zinc-800">ACTUALIZAR LLAVE</button>
        </form>
      </div>
      <div class="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
        <h3 class="text-sm font-bold text-zinc-900 uppercase mb-3">Actualizar fecha de cumpleaños</h3>
        <p class="text-zinc-500 text-xs mb-4">Esta fecha se usa para recuperar el acceso si olvidas tu contraseña.</p>
        <form id="form-admin-birthday" class="space-y-4">
          <div>
            <label class="block text-[10px] font-bold text-zinc-400 mb-2">Fecha de nacimiento registrada</label>
            <input type="date" id="new-nacimiento" value="${datosSeguridadLocal && datosSeguridadLocal.nacimiento ? datosSeguridadLocal.nacimiento : '2026-01-01'}" class="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-[#D32F2F] transition-all" />
          </div>
          <button type="submit" class="w-full rounded-2xl bg-zinc-900 py-3 text-sm font-bold text-white shadow-md transition hover:bg-zinc-800">ACTUALIZAR CUMPLEAÑOS</button>
        </form>
      </div>
      <div class="rounded-3xl border border-zinc-100 bg-zinc-50 p-4 shadow-sm">
        <p class="font-bold text-zinc-900 text-sm uppercase mb-2">Última actividad en la base de datos</p>
        <p id="seguridad-ultima-actividad" class="text-[11px] text-zinc-500">Cargando actividad reciente...</p>
      </div>
    </div>
  `;
  actualizarUltimaActividadSeguridad();
  async function actualizarUltimaActividadSeguridad() {
    try {
      const activitySnapshot = await getDoc(refActividadDB);
      if (!activitySnapshot.exists()) {
        document.getElementById('seguridad-ultima-actividad').textContent = 'No hay actividad reciente registrada.';
      } else {
        const actividad = activitySnapshot.data();
        let fechaActividad = null;
        if (actividad.ultimaActividad && typeof actividad.ultimaActividad.toDate === 'function') {
          fechaActividad = actividad.ultimaActividad.toDate();
        } else if (activitySnapshot.updateTime && typeof activitySnapshot.updateTime.toDate === 'function') {
          fechaActividad = activitySnapshot.updateTime.toDate();
        }
        document.getElementById('seguridad-ultima-actividad').textContent = fechaActividad ? `Última actividad en la base de datos: ${fechaActividad.toLocaleString('es-ES')}` : 'No hay actividad reciente disponible.';
      }
    } catch (err) {
      console.error('Error al leer última actividad en DB:', err);
      document.getElementById('seguridad-ultima-actividad').textContent = 'Error al cargar la actividad reciente.';
    }
  }
  document.getElementById('form-admin-security').onsubmit = async (e) => {
    e.preventDefault(); const np = document.getElementById('new-p').value.trim();
    if(np.length < 4) { mostrarSnackbarMensaje('Mínimo 4 caracteres', 'error', 3000); return; }
    await setDoc(doc(db, "configuracion", "credenciales"), { password: np, nacimiento: datosSeguridadLocal ? datosSeguridadLocal.nacimiento : "2026-01-01", ultimaActualizacion: serverTimestamp() }, { merge: true });
    await marcarActividadDB();
    datosSeguridadLocal = { ...datosSeguridadLocal, password: np };
    mostrarSnackbarMensaje('¡PIN Modificado con éxito!', 'success', 3000); e.target.reset();
    actualizarUltimaActividadSeguridad();
  };
  const formBirthday = document.getElementById('form-admin-birthday');
  if (formBirthday) {
    formBirthday.onsubmit = async (e) => {
      e.preventDefault();
      const nuevoNacimiento = document.getElementById('new-nacimiento').value.trim();
      if (!nuevoNacimiento) { mostrarSnackbarMensaje('Ingresa una fecha válida.', 'error', 3000); return; }
      await setDoc(doc(db, "configuracion", "credenciales"), { nacimiento: nuevoNacimiento, ultimaActualizacion: serverTimestamp() }, { merge: true });
      await marcarActividadDB();
      datosSeguridadLocal = { ...datosSeguridadLocal, nacimiento: nuevoNacimiento };
      mostrarSnackbarMensaje('Fecha de cumpleaños actualizada con éxito.', 'success', 3000);
      actualizarUltimaActividadSeguridad();
    };
  }
}


// =======================================================
// CONTROL DE NAVEGACIÓN GENERAL
// =======================================================
function resetearEstilosBotones() {
  [btnPrincipal, btnMembresias, btnDinamicas, btnEstadisticas, btnRoles, btnSeguridad].forEach(btn => { if(btn) btn.className = "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition text-zinc-400 hover:bg-zinc-900 hover:text-white font-medium"; });
}
function activarBoton(boton) {
  resetearEstilosBotones(); if(boton) boton.className = "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition bg-[#D32F2F] text-white font-medium shadow-lg shadow-red-900/10";
}

btnPrincipal.onclick = () => { activarBoton(btnPrincipal); cargarPantallaUnificada(); };
btnMembresias.onclick = () => { activarBoton(btnMembresias); cargarPantallaMembresiasMaster(); };
btnDinamicas.onclick = () => { activarBoton(btnDinamicas); cargarPantallaDinamicas(); };

// 🔥 ENLACE DE LLAMADAS COMPLETAMENTE DEPURADO
btnEstadisticas.onclick = () => { validarAccesoAdmin(cargarPantallaEstadisticas, btnEstadisticas); };
btnRoles.onclick = () => { validarAccesoAdmin(cargarPantallaRoles, btnRoles); };
btnSeguridad.onclick = () => { validarAccesoAdmin(cargarPantallaSeguridad, btnSeguridad); };

// Arrancamos el Panel Principal al abrir el sistema
cargarPantallaUnificada();