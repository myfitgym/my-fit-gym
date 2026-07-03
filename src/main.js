// Importamos la base de datos desde tu archivo de configuración
import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp, onSnapshot, query, where, doc, setDoc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import './admin.js';

// Referencias DOM (Barra Lateral de index.html)
const contenedorPantallas = document.getElementById('contenedor-pantallas');
const pantallaCalculadoraLibre = document.getElementById('pantalla-calculadora-libre');
const calcDisplay = document.getElementById('calc-display');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const btnPrincipal = document.getElementById('btn-principal');
const btnMembresias = document.getElementById('btn-membresias');
const btnDinamicas = document.getElementById('btn-dinamicas');
const btnCalculadoraLibre = document.getElementById('btn-calculadora-libre');
const btnEstadisticas = document.getElementById('btn-estadisticas');
const btnRoles = document.getElementById('btn-roles'); // Productos / Inventario
const btnSeguridad = document.getElementById('btn-seguridad'); // Seguridad
const offlineBanner = document.getElementById('offline-banner');

// ESTADO GLOBAL EN MEMORIA (Sincronizado en Tiempo Real con Firebase)
let productosVentaRapida = []; 
let serviciosVentaRapida = [];
let carrito = []; // Carrito acumulativo solicitado por el coach

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
const coloresGymVibrantes = ["#FF0000", "#111111", "#B80000", "#2A2A30", "#52525b", "#990000", "#7f1d1d"];
const esEmoji = (texto) => typeof texto === 'string' && /\p{Extended_Pictographic}/u.test(texto);

let desuscribirVentas = null;
let desuscribirClientes = null;
let desuscribirHistorialMesa = null;

// Sincronización de credenciales administrativas desde Firebase
let datosSeguridadLocal = null;
const refSeguridadDB = doc(db, "configuracion", "credenciales");
const refActividadDB = doc(db, "configuracion", "actividad");
datosSeguridadLocal = { password: "Admin123", nacimiento: "2026-01-01" };
onSnapshot(refSeguridadDB, (docSnap) => {
  if (docSnap.exists()) {
    datosSeguridadLocal = docSnap.data();
  }
});

// ESCUCHADOR EN TIEMPO REAL: Productos e Inventario (Sincronización en Vivo)
onSnapshot(collection(db, "productos"), (snapshot) => {
  productosVentaRapida = [];
  snapshot.forEach((docSnap) => {
    productosVentaRapida.push({ id: docSnap.id, ...docSnap.data() });
  });
  if (document.getElementById('grid-productos-pos')) {
    renderizarBotonesPOS();
  }
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
  if (desuscribirHistorialMesa) { desuscribirHistorialMesa(); desuscribirHistorialMesa = null; }
  if (pantallaCalculadoraLibre) pantallaCalculadoraLibre.classList.add('hidden');
  contenedorPantallas.classList.remove('hidden');
}

// Inicialización de textos del perfil por defecto
document.getElementById('usuario-nombre').textContent = "Operador Rodeo";
document.getElementById('usuario-rol').textContent = "Mostrador";

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
      offlineBanner.textContent = 'Modo offline activado. Los datos se guardan localmente.';
      offlineBanner.classList.remove('hidden');
    }
  } else {
    if (offlineBanner) offlineBanner.classList.add('hidden');
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

// =======================================================
// PANTALLA 1: PANEL PRINCIPAL (CON HISTORIAL REPARADO)
// =======================================================
function cargarPantallaUnificada() {
  apagarEscuchasActivos();
  document.getElementById('usuario-nombre').textContent = "Operador Rodeo";
  document.getElementById('usuario-rol').textContent = "Mostrador";

  contenedorPantallas.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <div class="lg:col-span-2 space-y-6">
        <div class="p-6 bg-white border border-zinc-200 rounded-3xl shadow-sm">
          <p class="text-[10px] font-bold text-zinc-400 tracking-wider uppercase">Ganancias de Hoy</p>
          <h3 class="text-4xl font-black text-zinc-900 mt-1" id="ganancias-hoy">$0.00</h3>
        </div>
        
        <div class="space-y-4">
          <div>
            <h2 class="text-2xl font-black text-zinc-900 tracking-tight">Venta en un Clic</h2>
            <p class="text-zinc-500 text-xs">Los productos se agregarán a la orden de cobro de la derecha.</p>
          </div>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 auto-rows-fr" id="grid-productos-pos">
            </div>
        </div>

        <div class="p-5 bg-white border border-zinc-200 rounded-3xl space-y-3 shadow-sm">
          <h3 class="font-black text-xs tracking-wider text-zinc-700 uppercase">Ventas del Día</h3>
          <div class="overflow-x-auto max-h-[350px] overflow-y-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="text-zinc-400 border-b"><th class="pb-2">Hora</th><th class="pb-2">Venta</th><th class="pb-2 text-center">Método</th><th class="pb-2 text-right">Total</th><th class="pb-2 text-right">Eliminar</th></tr>
              </thead>
              <tbody id="historial-ventas-hoy-tabla"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="space-y-6">
        <div class="p-5 bg-zinc-900 text-white border border-zinc-800 rounded-3xl space-y-4 shadow-xl">
          <div class="flex items-center gap-2 text-red-500">
            <span class="material-symbols-outlined font-bold">shopping_cart</span>
            <h3 class="font-black text-xs tracking-wider uppercase text-zinc-100">Orden de Cobro</h3>
          </div>
          <div id="elementos-carrito" class="space-y-2 max-h-[180px] overflow-y-auto text-xs text-zinc-300">
            </div>
          <div class="border-t border-zinc-800 pt-3 flex justify-between items-center">
            <span class="text-sm font-bold text-zinc-400">Total a pagar:</span>
            <span class="text-2xl font-black text-emerald-400" id="total-carrito">$0.00</span>
          </div>
          
          <div class="space-y-2">
            <label class="block text-[10px] font-bold text-zinc-500 uppercase">Método de Pago</label>
            <div class="grid grid-cols-2 gap-2">
              <button id="pago-efectivo" class="py-2.5 rounded-xl font-bold text-xs bg-[#D32F2F] text-white border border-transparent transition-all">EFECTIVO</button>
              <button id="pago-tarjeta" class="py-2.5 rounded-xl font-bold text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 transition-all">TARJETA</button>
            </div>
          </div>

          <div id="modulo-cambio" class="space-y-2 bg-zinc-950 p-3 rounded-2xl border border-zinc-800">
            <label class="block text-[10px] font-bold text-zinc-500 uppercase">¿Con cuánto paga?</label>
            <input type="number" id="monto-recibido" placeholder="0.00" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm font-mono text-white outline-none focus:border-red-500" />
            <div id="cambio-resultado" class="text-xs font-black text-emerald-400 pt-1">Cambio: $0.00</div>
          </div>

          <button id="btn-finalizar-compra" class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs tracking-wider rounded-xl shadow-md transition-all uppercase">Confirmar y Registrar Venta</button>
        </div>

        <div class="p-5 bg-[#FFF5F5] border border-red-100 rounded-3xl space-y-4 shadow-sm">
          <div class="flex items-center gap-2 text-[#D32F2F]"><span class="material-symbols-outlined font-bold text-xl">notifications_active</span><h3 class="font-black text-xs tracking-wider uppercase">Por Vencer (WhatsApp)</h3></div>
          <div class="space-y-3 max-h-[220px] overflow-y-auto pr-1" id="lista-alertas-vencimiento"></div>
        </div>
      </div>
    </div>`

  renderizarBotonesPOS();
  renderizarCarrito();
  configurarEventosPago();

  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0, 0);
  const finHoy = new Date(inicioHoy);
  finHoy.setDate(finHoy.getDate() + 1);
  const qVentas = query(collection(db, "ventas"), where("fecha", ">=", inicioHoy), where("fecha", "<", finHoy));
  
  desuscribirVentas = onSnapshot(qVentas, (snapshot) => {
    const txtGanancias = document.getElementById('ganancias-hoy'); if (!txtGanancias) return;
    let totalHoy = 0; snapshot.forEach((doc) => { totalHoy += Number(doc.data().monto || 0); });
    txtGanancias.textContent = `$${totalHoy.toFixed(2)}`;
  });

  // REPARADO: Muestra correctamente el concepto textual sin romperse
  desuscribirHistorialMesa = onSnapshot(qVentas, (snapshot) => {
    const tabla = document.getElementById('historial-ventas-hoy-tabla'); if (!tabla) return;
    let registros = [];
    snapshot.forEach((d) => {
      const data = d.data();
      let f = data.fecha;
      if (f && typeof f.toDate === 'function') {
        f = f.toDate();
      } else if (typeof f === 'string' || typeof f === 'number') {
        f = new Date(f);
      } else {
        f = new Date();
      }
      registros.push({ id: d.id, ...data, fecha: f });
    });
    registros.sort((a,b) => b.fecha - a.fecha);

    if (registros.length === 0) {
      tabla.innerHTML = `<tr><td colspan="5" class="py-3 text-center text-zinc-400 italic">No hay ventas registradas hoy.</td></tr>`;
      return;
    }

    tabla.innerHTML = registros.map(v => `
      <tr class="border-b hover:bg-zinc-50">
        <td class="py-2.5 font-mono text-[11px] text-zinc-500">${v.fecha.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
        <td class="py-2.5 font-bold text-zinc-800 truncate max-w-[280px]">${v.concepto || 'Venta Express'}</td>
        <td class="py-2.5 text-center"><span class="px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${v.metodoPago === 'Tarjeta' || v.metodo === 'tarjeta' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}">${v.metodoPago || v.metodo || 'Efectivo'}</span></td>
        <td class="py-2.5 text-right font-black text-zinc-900">$${Number(v.monto).toFixed(2)}</td>
        <td class="py-2.5 text-right"><button type="button" data-id="${v.id}" class="btn-cancelar-historial px-3 py-1 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold">Eliminar</button></td>
      </tr>
    `).join('');

    tabla.querySelectorAll('.btn-cancelar-historial').forEach(btn => {
      btn.onclick = async () => {
        const ventaId = btn.getAttribute('data-id');
        if (!(await mostrarConfirmacion("¿Deseas anular esta venta? Esto restablecerá el inventario si aplica."))) return;
        try {
          const ventaSnap = await getDoc(doc(db, "ventas", ventaId));
          if (ventaSnap.exists() && ventaSnap.data().productosArr) {
            for (const p of ventaSnap.data().productosArr) {
              const prodRef = doc(db, "productos", p.id);
              const pSnap = await getDoc(prodRef);
              if (pSnap.exists() && pSnap.data().tipo !== 'servicio') {
                await updateDoc(prodRef, { stock: Number(pSnap.data().stock || 0) + Number(p.cantidad) });
              }
            }
          }
          await deleteDoc(doc(db, "ventas", ventaId));
          await marcarActividadDB();
          mostrarSnackbarMensaje('Venta cancelada e inventario reajustado', 'info', 3000);
        } catch (e) { console.error(e); }
      };
    });
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

function obtenerItemsPos() {
  const existenteIds = new Set(productosVentaRapida.map(p => p.id));
  return [
    ...productosVentaRapida,
    ...serviciosVentaRapida.filter(servicio => !existenteIds.has(servicio.id))
  ];
}

function renderizarBotonesPOS() {
  const grid = document.getElementById('grid-productos-pos'); if (!grid) return;
  const listaItems = obtenerItemsPos();
  grid.innerHTML = listaItems.map(prod => {
    const iconoClass = esEmoji(prod.icono) ? '' : 'material-symbols-outlined';
    const esServicio = prod.tipo === 'servicio';
    const agotado = !esServicio && Number(prod.stock || 0) <= 0;
    return `
      <button data-id="${prod.id}" ${agotado ? 'disabled' : ''} class="btn-producto-pos w-full min-h-[140px] flex flex-col items-center justify-center p-4 bg-white border border-zinc-200 rounded-3xl hover:border-[#D32F2F] transition-all transform active:scale-95 group shadow-sm disabled:opacity-40 disabled:bg-zinc-100 disabled:border-zinc-200 disabled:pointer-events-none">
        <div class="w-12 h-12 bg-zinc-100 group-hover:bg-red-50 rounded-2xl flex items-center justify-center text-zinc-700 group-hover:text-[#D32F2F] transition mb-2">
          <span class="${iconoClass} text-xl">${prod.icono || 'box'}</span>
        </div>
        <span class="font-bold text-zinc-800 text-xs text-center truncate w-full">${prod.nombre}</span>
        <span class="text-[10px] font-semibold ${agotado ? 'text-red-500 font-bold' : 'text-zinc-400'} mb-1.5">${esServicio ? 'Ilimitado 🎫' : `Stock: ${prod.stock ?? 0}`}</span>
        <span class="text-[11px] px-2.5 py-0.5 bg-zinc-900 text-white rounded-full font-bold">$${prod.precio}</span>
      </button>
    `;
  }).join('');

  grid.querySelectorAll('.btn-producto-pos').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id');
      const producto = obtenerItemsPos().find(p => p.id === id);
      agregarAlCarrito(producto);
    };
  });
}

function agregarAlCarrito(producto) {
  const existe = carrito.find(item => item.id === producto.id);
  if (existe) {
    if (producto.tipo !== 'servicio' && existe.cantidad >= Number(producto.stock || 0)) {
      mostrarSnackbarMensaje('Alcanzaste el límite del stock disponible', 'error', 2500);
      return;
    }
    existe.cantidad++;
  } else {
    carrito.push({ ...producto, cantidad: 1 });
  }
  renderizarCarrito();
}

function renderizarCarrito() {
  const contenedor = document.getElementById('elementos-carrito');
  const txtTotal = document.getElementById('total-carrito');
  if (!contenedor || !txtTotal) return;

  if (carrito.length === 0) {
    contenedor.innerHTML = `<p class="text-center text-zinc-500 py-4 italic">Orden vacía. Presiona productos.</p>`;
    txtTotal.textContent = "$0.00";
    calcularCambioCalculadora(0);
    return;
  }

  let total = 0;
  contenedor.innerHTML = carrito.map((item, index) => {
    const subtotal = item.precio * item.cantidad;
    total += subtotal;
    return `
      <div class="flex items-center justify-between bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
        <div class="overflow-hidden mr-2">
          <p class="font-bold text-zinc-100 truncate">${item.nombre}</p>
          <p class="text-[10px] text-zinc-500">$${item.precio} c/u x ${item.cantidad}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-bold text-emerald-400">$${subtotal}</span>
          <button data-index="${index}" class="btn-quitar-carrito w-6 h-6 flex items-center justify-center rounded-lg bg-zinc-800 text-red-400 hover:bg-zinc-700 font-bold">✕</button>
        </div>
      </div>
    `;
  }).join('');

  txtTotal.textContent = `$${total.toFixed(2)}`;
  calcularCambioCalculadora(total);

  contenedor.querySelectorAll('.btn-quitar-carrito').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.getAttribute('data-index'));
      carrito.splice(idx, 1);
      renderizarCarrito();
    };
  });
}

let metodoPagoActual = "Efectivo";
function configurarEventosPago() {
  const btnEfectivo = document.getElementById('pago-efectivo');
  const btnTarjeta = document.getElementById('pago-tarjeta');
  const moduloCambio = document.getElementById('modulo-cambio');
  const inputMonto = document.getElementById('monto-recibido');
  const btnFinalizar = document.getElementById('btn-finalizar-compra');

  if (!btnEfectivo || !btnTarjeta) return;

  btnEfectivo.onclick = () => {
    metodoPagoActual = "Efectivo";
    btnEfectivo.className = "py-2.5 rounded-xl font-bold text-xs bg-[#D32F2F] text-white border border-transparent transition-all";
    btnTarjeta.className = "py-2.5 rounded-xl font-bold text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 transition-all";
    moduloCambio.classList.remove('hidden');
    const total = carrito.reduce((sum, i) => sum + (i.precio * i.cantidad), 0);
    calcularCambioCalculadora(total);
  };

  btnTarjeta.onclick = () => {
    metodoPagoActual = "Tarjeta";
    btnTarjeta.className = "py-2.5 rounded-xl font-bold text-xs bg-blue-600 text-white border border-transparent transition-all";
    btnEfectivo.className = "py-2.5 rounded-xl font-bold text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 transition-all";
    moduloCambio.classList.add('hidden');
  };

  inputMonto.oninput = () => {
    const total = carrito.reduce((sum, i) => sum + (i.precio * i.cantidad), 0);
    calcularCambioCalculadora(total);
  };

  btnFinalizar.onclick = async () => {
    if (carrito.length === 0) {
      mostrarSnackbarMensaje('El carrito está vacío.', 'error', 2500);
      return;
    }
    const total = carrito.reduce((sum, i) => sum + (i.precio * i.cantidad), 0);
    if (metodoPagoActual === "Efectivo" && !inputMonto.value.trim()) {
      mostrarSnackbarMensaje('Ingresa el monto recibido antes de confirmar la venta en efectivo.', 'error', 2500);
      return;
    }
    if (metodoPagoActual === "Efectivo" && Number(inputMonto.value) < total) {
      mostrarSnackbarMensaje('El monto recibido es menor al total a pagar.', 'error', 2500);
      return;
    }

    try {
      const conceptoStr = carrito.map(i => `${i.cantidad}x ${i.nombre}`).join(', ');

      await addDoc(collection(db, "ventas"), {
        tipo: carrito.some(i => i.nombre.toLowerCase().includes('membresia')) ? 'membresia' : 'producto',
        concepto: conceptoStr,
        monto: total,
        metodoPago: metodoPagoActual,
        productosArr: carrito.map(i => ({ id: i.id, nombre: i.nombre, cantidad: i.cantidad })),
        fecha: serverTimestamp()
      });

      for (const item of carrito) {
        const prodRef = doc(db, "productos", item.id);
        const snapshot = await getDoc(prodRef);
        if (snapshot.exists() && snapshot.data().tipo !== 'servicio') {
          const stockActual = Number(snapshot.data().stock || 0);
          await updateDoc(prodRef, { stock: Math.max(0, stockActual - Number(item.cantidad)) });
        }
      }

      await marcarActividadDB();
      if (window.confetti) window.confetti({ particleCount: 80, spread: 50 });
      mostrarSnackbarMensaje('Venta procesada e inventario actualizado', 'success', 3000);
      
      carrito = [];
      inputMonto.value = "";
      renderizarCarrito();
    } catch (e) {
      console.error(e);
      mostrarSnackbarMensaje('Error al guardar venta en la nube', 'error', 3000);
    }
  };
}

function calcularCambioCalculadora(total) {
  const inputMonto = document.getElementById('monto-recibido');
  const divCambio = document.getElementById('cambio-resultado');
  if (!divCambio || !inputMonto) return;

  if (carrito.length === 0 || !inputMonto.value) {
    divCambio.textContent = "Cambio: $0.00";
    return;
  }
  const recibido = Number(inputMonto.value);
  const cambio = recibido - total;
  divCambio.textContent = cambio >= 0 ? `Cambio: $${cambio.toFixed(2)}` : `Faltan: $${Math.abs(cambio).toFixed(2)}`;
}

function mostrarSnackbarMensaje(texto, variante = 'info', duracion = 2800) {
  const container = getSnackbarContainer(); if (!container) return;
  const wrap = document.createElement('div');
  wrap.className = 'pointer-events-auto flex items-center justify-between gap-4 px-4 py-2 rounded-2xl shadow-md min-w-[220px]';
  const paleta = {
    info: { bg: 'bg-[#121212]', text: 'text-zinc-100', accent: '#D32F2F' },
    success: { bg: 'bg-emerald-50', text: 'text-emerald-700', accent: '#059669' },
    error: { bg: 'bg-red-50', text: 'text-red-700', accent: '#B91C1C' }
  };
  const p = paleta[variante] || paleta.info;
  wrap.innerHTML = `<div class="flex items-center gap-3"><span class="h-8 w-8 flex items-center justify-center rounded-full" style="background:${p.accent}33"> <span class="material-symbols-outlined text-white text-sm">info</span></span><div class="text-sm font-medium ${p.text}">${texto}</div></div>`;
  if (variante === 'info') wrap.classList.add('bg-[#121212]','text-zinc-100');
  if (variante === 'success') wrap.classList.add('bg-emerald-50','text-emerald-700');
  if (variante === 'error') wrap.classList.add('bg-red-50','text-red-700');
  container.appendChild(wrap);
  setTimeout(() => { wrap.remove(); }, duracion);
}

// Exponer la función de notificaciones para que otros módulos (admin.js) la usen
window.mostrarSnackbarMensaje = mostrarSnackbarMensaje;

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

// Exponer confirmación personalizada
window.mostrarConfirmacion = mostrarConfirmacion;

// Sincronizar precios de servicios desde Firestore para que cambios en admin.js
// (configuracion/preciosServicios) actualicen las membresías en pantalla.
try {
  const refPreciosServicios = doc(db, 'configuracion', 'preciosServicios');
  onSnapshot(refPreciosServicios, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    serviciosVentaRapida = [];
    if (data.caminadora !== undefined) {
      serviciosVentaRapida.push({
        id: 'caminadora',
        nombre: 'Caminadora',
        precio: Number(data.caminadora),
        tipo: 'servicio',
        icono: data.caminadoraIcono || '🏃'
      });
    }
    if (data.visita !== undefined) {
      serviciosVentaRapida.push({
        id: 'visita',
        nombre: 'Visita',
        precio: Number(data.visita),
        tipo: 'servicio',
        icono: data.visitaIcono || '🎟️'
      });
    }
    if (data.membresia) {
      preciosMembresias.mes = Number(data.membresia);
      const btn = document.querySelector('#form-mes button[type="submit"]');
      if (btn) btn.textContent = `COBRAR $${preciosMembresias.mes.toFixed(2)}`;
    }
    if (data.semana) {
      preciosMembresias.semana = Number(data.semana);
      const btn2 = document.querySelector('#form-semana button[type="submit"]');
      if (btn2) btn2.textContent = `COBRAR $${preciosMembresias.semana.toFixed(2)}`;
    }
    if (document.getElementById('grid-productos-pos')) {
      renderizarBotonesPOS();
    }
  });
} catch (e) {
  console.error('No se pudieron sincronizar precios de servicios', e);
}

function getSnackbarContainer() {
  let container = document.getElementById('snackbar-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'snackbar-container';
    container.className = 'fixed bottom-6 right-6 z-50 space-y-2 pointer-events-none';
    document.body.appendChild(container);
  }
  return container;
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
          await addDoc(collection(db, "ventas"), { tipo: "membresia", concepto: `Renovación ${tipo.toUpperCase()}: ${nombre}`, monto: precio, metodoPago: "Efectivo", fecha: serverTimestamp() });
          await marcarActividadDB();
          document.getElementById('modal-reincorporar').classList.add('hidden');
          mostrarSnackbarMensaje('Membresía renovada', 'success', 2500);
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
      await addDoc(collection(db, "ventas"), { tipo: "membresia", concepto: `Inscripción ${tipo.toUpperCase()}: ${nombre}`, monto: precio, metodoPago: "Efectivo", fecha: serverTimestamp() });
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
          <canvas id="canvas-ruleta" width="600" height="600" class="w-full h-full rounded-full shadow-2xl border-8 border-zinc-900 bg-zinc-900 transition-transform ease-out"></canvas>
          <button id="btn-grid-girar" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-16 h-16 md:w-20 md:h-20 bg-zinc-900 border-4 border-white text-white rounded-full font-black text-xs md:text-sm tracking-wider shadow-xl">GIRAR</button>
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

  const openConfigModal = () => { if (modal) modal.classList.remove('hidden'); renderConfigRuleta(); };
  const closeConfigModal = () => { if (modal) modal.classList.add('hidden'); };
  const actualizarTotalConfiguracion = () => { const total = configuracionRuleta.reduce((sum, item) => sum + Number(item.probabilidad || 0), 0); totalDisplay.textContent = `${total}%`; if (total !== 100) { warningTotal.classList.remove('hidden'); totalDisplay.classList.add('text-red-600'); } else { warningTotal.classList.add('hidden'); totalDisplay.classList.remove('text-red-600'); } return total; };

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
        renderConfigRuleta(); actualizarTotalConfiguracion(); dibujarRuleta();
      };
    });
    configList.querySelectorAll('[data-field]').forEach((input) => {
      input.oninput = () => {
        const field = input.getAttribute('data-field'); const index = Number(input.getAttribute('data-index'));
        if (Number.isFinite(index) && configuracionRuleta[index]) { configuracionRuleta[index][field] = field === 'probabilidad' ? Number(input.value) : input.value; actualizarTotalConfiguracion(); dibujarRuleta(); }
      };
    });
    actualizarTotalConfiguracion(); dibujarRuleta();
  };

  if (btnConfigRuleta) btnConfigRuleta.onclick = openConfigModal;
  if (btnCloseConfig) btnCloseConfig.onclick = closeConfigModal;
  if (btnAddRuletaItem) btnAddRuletaItem.onclick = () => { configuracionRuleta.push({ premio: 'Nuevo premio', icono: '✨', color: coloresGymVibrantes[configuracionRuleta.length % coloresGymVibrantes.length], probabilidad: 0 }); renderConfigRuleta(); };
  if (btnResetColors) btnResetColors.onclick = () => { configuracionRuleta.forEach((item, index) => { item.color = coloresGymVibrantes[index % coloresGymVibrantes.length]; }); renderConfigRuleta(); dibujarRuleta(); };
  if (btnSaveConfig) btnSaveConfig.onclick = () => { const total = actualizarTotalConfiguracion(); if (total !== 100) { mostrarSnackbarMensaje('Debe sumar 100%.', 'error', 3000); return; } closeConfigModal(); mostrarSnackbarMensaje('Configuración guardada.', 'success', 2600); };

  let g = false; let currentRotation = 0;
  document.getElementById('btn-grid-girar').onclick = () => {
    if (g) return; g = true; const txt = document.getElementById('resultado-premio'); txt.classList.add('opacity-0');
    const totalSum = configuracionRuleta.reduce((sum, item) => sum + Number(item.probabilidad || 0), 0);
    if (totalSum !== 100) { mostrarSnackbarMensaje('Debe sumar 100% para poder girar.', 'error', 3000); g = false; return; }
    let r = Math.random() * totalSum; let acumulado = 0; let iG = 0;
    for (let i = 0; i < configuracionRuleta.length; i++) { acumulado += Number(configuracionRuleta[i].probabilidad || 0); if (r <= acumulado) { iG = i; break; } }
    const anguloCentro = (iG * (360 / configuracionRuleta.length)) + ((360 / configuracionRuleta.length) / 2);
    const objetivoModulo = ((270 - anguloCentro) % 360 + 360) % 360; const delta = ((objetivoModulo - (currentRotation % 360) + 360) % 360);
    currentRotation += (6 * 360) + delta; canvas.style.transition = "transform 4.5s cubic-bezier(0.15, 0.85, 0.15, 1)"; canvas.style.transform = `rotate(${currentRotation}deg)`;
    setTimeout(() => { g = false; txt.innerHTML = `🎁 GANASTE: ${configuracionRuleta[iG].premio}`; txt.classList.remove('opacity-0'); if (window.confetti) window.confetti({ particleCount: 140, spread: 80 }); }, 4500);
  };
}

// =======================================================
// PANTALLA: CALCULADORA BÁSICA EXTRA GENERAL
// =======================================================
btnCalculadoraLibre.onclick = () => {
  apagarEscuchasActivos();
  resetearEstilosBotones();
  btnCalculadoraLibre.className = "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition bg-[#D32F2F] text-white font-medium shadow-lg shadow-red-900/10 text-left text-sm";
  contenedorPantallas.classList.add('hidden');
  pantallaCalculadoraLibre.classList.remove('hidden');
  calcDisplay.textContent = "0";
};

document.querySelectorAll('.btn-calc').forEach(btn => {
  btn.onclick = () => {
    const valor = btn.getAttribute('data-val'); const actual = calcDisplay.textContent;
    if (valor === 'C') { calcDisplay.textContent = "0"; } 
    else if (valor === '=') { try { let exp = actual.replace(/×/g, '*').replace(/÷/g, '/'); calcDisplay.textContent = Number(eval(exp)).toString(); } catch (e) { calcDisplay.textContent = "Error"; } } 
    else { if (actual === "0" || actual === "Error") { calcDisplay.textContent = valor; } else { calcDisplay.textContent += valor; } }
  };
});

// =======================================================
// CONTROL DE NAVEGACIÓN GENERAL (PUENTE INTERCOMUNICADOR CORREGIDO)
// =======================================================
function resetearEstilosBotones() {
  [btnPrincipal, btnMembresias, btnDinamicas, btnCalculadoraLibre, btnEstadisticas, btnRoles, btnSeguridad].forEach(btn => { if(btn) btn.className = "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition text-zinc-400 hover:bg-zinc-900 hover:text-white font-medium text-left text-sm"; });
}
function activarBoton(boton) {
  resetearEstilosBotones(); if(boton) boton.className = "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition bg-[#D32F2F] text-white font-medium shadow-lg shadow-red-900/10 text-left text-sm";
}

btnPrincipal.onclick = () => { 
  window.dispatchEvent(new CustomEvent('limpiarGraficosAdmin')); // Apaga observadores gerenciales
  activarBoton(btnPrincipal); 
  cargarPantallaUnificada(); 
};
btnMembresias.onclick = () => { 
  window.dispatchEvent(new CustomEvent('limpiarGraficosAdmin')); 
  activarBoton(btnMembresias); 
  cargarPantallaMembresiasMaster(); 
};
btnDinamicas.onclick = () => { 
  window.dispatchEvent(new CustomEvent('limpiarGraficosAdmin')); 
  activarBoton(btnDinamicas); 
  cargarPantallaDinamicas(); 
};

// Redireccionadores mediante CustomEvents para activar la interfaz protegida de admin.js
btnEstadisticas.onclick = () => { 
  apagarEscuchasActivos();
  activarBoton(btnEstadisticas);
  window.dispatchEvent(new CustomEvent('abrirEstadisticasAdmin'));
};
btnRoles.onclick = () => { 
  apagarEscuchasActivos();
  activarBoton(btnRoles);
  window.dispatchEvent(new CustomEvent('abrirProductosAdmin'));
};
btnSeguridad.onclick = () => { 
  apagarEscuchasActivos();
  activarBoton(btnSeguridad);
  window.dispatchEvent(new CustomEvent('abrirSeguridadAdmin'));
};

// Arrancamos el Panel Principal al abrir el sistema
cargarPantallaUnificada();