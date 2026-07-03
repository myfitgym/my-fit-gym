import { db } from './firebase.js';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDoc, serverTimestamp, updateDoc, addDoc } from 'firebase/firestore';

const contenedorPantallas = document.getElementById('contenedor-pantallas');
const btnEstadisticas = document.getElementById('btn-estadisticas');
const btnRoles = document.getElementById('btn-roles');
const btnSeguridad = document.getElementById('btn-seguridad');

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
          productosArr: Array.isArray(data.productosArr) ? data.productosArr : []
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
  modalAdminForgot.onclick = async () => {
    const nacimientoMaestro = datosSeguridadLocal?.nacimiento || '2026-01-01';
    const valor = prompt('🎂 Ingresa tu fecha de nacimiento (AAAA-MM-DD) para recuperar la clave:');
    if (valor === nacimientoMaestro) {
      if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje(`Tu contraseña maestra es: ${datosSeguridadLocal?.password || 'Admin123'}`, 'info'); else alert(`Tu contraseña maestra es: ${datosSeguridadLocal?.password || 'Admin123'}`);
      modalAdminError.classList.add('hidden');
    } else {
      modalAdminError.textContent = 'Fecha de nacimiento incorrecta.';
      modalAdminError.classList.remove('hidden');
    }
  };
}

inicializarModalAccesoAdmin();

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
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 p-5 bg-white border rounded-3xl h-[280px] relative flex items-center justify-center"><canvas id="chart-linea-ingresos"></canvas></div>
        <div class="p-5 bg-white border rounded-3xl h-[280px] relative flex items-center justify-center"><canvas id="chart-dona-mix"></canvas></div>
      </div>

      <div class="bg-white border rounded-3xl p-5 shadow-sm space-y-6">
        <div>
          <h3 class="text-sm font-bold text-zinc-900 uppercase mb-3" id="titulo-tabla-operaciones-admin">Operaciones del Periodo</h3>
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
          <h3 class="text-sm font-bold text-zinc-900 uppercase mb-3">Ventas del Mes</h3>
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
  const etiquetasBarras = [];
  const montosBarras = [];

  ventasFiltradas.slice(0, 7).forEach((venta) => {
    total += venta.monto;
    if (venta.tipo === 'producto') prod += venta.monto;
    if (venta.tipo === 'membresia') mbs += venta.monto;
    etiquetasBarras.push(venta.concepto ? venta.concepto.substring(0, 15) : 'Venta');
    montosBarras.push(venta.monto);
  });

  const kpiIngreso = document.getElementById('kpi-ingreso-mes');
  const kpiMiembros = document.getElementById('kpi-miembros-activos');
  const kpiProductos = document.getElementById('kpi-productos-monto');
  const kpiTicket = document.getElementById('kpi-ticket-promedio');
  const tituloTabla = document.getElementById('titulo-tabla-operaciones-admin');

  if (kpiIngreso) kpiIngreso.textContent = `$${total.toFixed(2)}`;
  if (kpiMiembros) kpiMiembros.textContent = `${ventasFiltradas.length}`;
  if (kpiProductos) kpiProductos.textContent = `$${prod.toFixed(2)}`;
  if (kpiTicket) kpiTicket.textContent = `$${(ventasFiltradas.length > 0 ? total / ventasFiltradas.length : 0).toFixed(2)}`;
  if (tituloTabla) tituloTabla.textContent = `Operaciones del Periodo (${filtroTemporalActual.toUpperCase()})`;

  const tbodyAdmin = document.getElementById('tabla-dashboard-ventas-admin');
  if (tbodyAdmin) {
    if (ventasFiltradas.length === 0) {
      tbodyAdmin.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-zinc-400 italic">No hay transacciones registradas en este periodo.</td></tr>`;
    } else {
      tbodyAdmin.innerHTML = ventasFiltradas
        .map((venta) => `
          <tr class="border-b hover:bg-zinc-50 text-[11px] transition-colors">
            <td class="py-2.5 text-zinc-500 font-mono">${venta.fecha.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td class="py-2 font-bold text-zinc-800">${venta.concepto}</td>
            <td class="py-2 uppercase font-bold text-[9px] text-zinc-400 tracking-wider">${venta.tipo === 'membresia' ? '🎫 Membresía' : '📦 Producto'}</td>
            <td class="py-2 text-center"><span class="px-2 py-0.5 rounded-full font-black text-[9px] uppercase ${venta.metodoPago === 'Tarjeta' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}">${venta.metodoPago}</span></td>
            <td class="py-2 font-black text-right text-zinc-950">$${venta.monto.toFixed(2)}</td>
            <td class="py-2 text-right"><button data-id="${venta.id}" class="btn-anular-gerencial text-red-600 font-bold hover:underline">Anular 🗑️</button></td>
          </tr>
        `)
        .join('');

      tbodyAdmin.querySelectorAll('.btn-anular-gerencial').forEach((btn) => {
        btn.onclick = async () => {
          const idVenta = btn.getAttribute('data-id');
          if (!idVenta) return;
          if (!confirm('🚨 ¿Estás seguro de anular permanentemente esta venta? Se devolverá el stock correspondiente.')) return;

          try {
            const ventaSnap = await getDoc(doc(db, 'ventas', idVenta));
            if (ventaSnap.exists()) {
              const ventaData = ventaSnap.data();
              const productosArr = Array.isArray(ventaData.productosArr) ? ventaData.productosArr : [];
              for (const item of productosArr) {
                if (!item || !item.id) continue;
                const productoRef = doc(db, 'productos', item.id);
                const productoSnap = await getDoc(productoRef);
                if (productoSnap.exists() && productoSnap.data().tipo !== 'servicio') {
                  await updateDoc(productoRef, { stock: Number(productoSnap.data().stock || 0) + Number(item.cantidad || 0) });
                }
              }
            }
            await deleteDoc(doc(db, 'ventas', idVenta));
            if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje('✨ Venta de caja anulada con éxito.', 'info'); else alert('✨ Venta de caja anulada con éxito.');
          } catch (error) {
            console.error(error);
          }
        };
      });
    }
  }

  const ventasDelMes = ventasCacheGlobalAdmin.filter((venta) => {
    return venta.fecha && venta.fecha.getMonth() === ahora.getMonth() && venta.fecha.getFullYear() === ahora.getFullYear();
  });
  const tbodyMes = document.getElementById('tabla-ventas-mes-admin');
  if (tbodyMes) {
    if (ventasDelMes.length === 0) {
      tbodyMes.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-zinc-400 italic">No hay ventas del mes registradas.</td></tr>`;
    } else {
      tbodyMes.innerHTML = ventasDelMes
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
          if (!confirm('🚨 ¿Deseas anular esta venta mensual? Esto restablecerá el stock si aplica.')) return;
          try {
            const ventaSnap = await getDoc(doc(db, 'ventas', idVenta));
            if (ventaSnap.exists()) {
              const ventaData = ventaSnap.data();
              const productosArr = Array.isArray(ventaData.productosArr) ? ventaData.productosArr : [];
              for (const item of productosArr) {
                if (!item || !item.id) continue;
                const productoRef = doc(db, 'productos', item.id);
                const productoSnap = await getDoc(productoRef);
                if (productoSnap.exists() && productoSnap.data().tipo !== 'servicio') {
                  await updateDoc(productoRef, { stock: Number(productoSnap.data().stock || 0) + Number(item.cantidad || 0) });
                }
              }
            }
            await deleteDoc(doc(db, 'ventas', idVenta));
            if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje('✨ Venta mensual anulada con éxito.', 'info'); else alert('✨ Venta mensual anulada con éxito.');
          } catch (error) {
            console.error(error);
          }
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
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    }

    const ctxDona = document.getElementById('chart-dona-mix');
    if (ctxDona) {
      if (chartDonaAdmin) {
        chartDonaAdmin.destroy();
        chartDonaAdmin = null;
      }
      chartDonaAdmin = new Chart(ctxDona, {
        type: 'doughnut',
        data: {
          labels: ['Membresías', 'Productos'],
          datasets: [{ data: [mbs, prod], backgroundColor: ['#121212', '#D32F2F'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
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
            <div>
              <label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Icono</label>
              <select id="add-admin-icono" class="w-full px-3 py-2 bg-zinc-50 border rounded-xl text-xs outline-none">
                <option value="🥤">🥤 Batido</option>
                <option value="🚰">🚰 Botella</option>
                <option value="🍫">🍫 Snack</option>
                <option value="🍫">🍫 Barra</option>
                <option value="🍏">🍏 Snack Saludable</option>
                <option value="💊">💊 Creatina</option>
                <option value="🥛">🥛 Proteína</option>
                <option value="⚡">⚡ Preentreno</option>
                <option value="👕">👕 Camiseta</option>
                <option value="👖">👖 Pantalón</option>
                <option value="👜">👜 Bolsa</option>
                <option value="🩳">🩳 Short</option>
                <option value="🧢">🧢 Gorra</option>
                <option value="🏋️">🏋️ Gym</option>
                <option value="🛍️">🛍️ Merch</option>
                <option value="🎟️">🎟️ Ticket Dorado</option>
              </select>
            </div>
            <div><label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Precio</label><input type="number" id="add-admin-precio" class="w-full px-3 py-2 bg-zinc-50 border rounded-xl text-xs outline-none" /></div>
            <div>
              <label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Tipo</label>
              <select id="add-admin-tipo" class="w-full px-3 py-2 bg-zinc-50 border rounded-xl text-xs outline-none font-bold">
                <option value="producto">Producto Físico (Con Stock)</option>
                <option value="servicio">Servicio (Sin Stock/Visitas/Membresías)</option>
              </select>
            </div>
            <div id="wrapper-add-stock-field"><label class="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Stock Disponible</label><input type="number" id="add-admin-stock" value="10" class="w-full px-3 py-2 bg-zinc-50 border rounded-xl text-xs outline-none" /></div>
          </div>
        <div class="flex gap-2 justify-end">
          <button id="btn-admin-cancelar-add" class="px-3 py-1.5 rounded-xl bg-zinc-100 text-xs">Cancelar</button>
          <button id="btn-admin-guardar-add" class="px-3 py-1.5 rounded-xl bg-zinc-900 text-white font-bold text-xs">Guardar en Firebase</button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="bg-white border rounded-3xl p-4 shadow-sm overflow-x-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold uppercase text-zinc-900">Precios de Servicios</h3>
          </div>
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="text-zinc-400 border-b"><th class="pb-2">Servicio</th><th class="pb-2">Precio</th><th class="pb-2">Emoji</th><th class="pb-2 text-right">Acción</th></tr>
            </thead>
            <tbody id="tabla-servicios-admin"></tbody>
          </table>
        </div>

        <div class="bg-white border rounded-3xl p-4 shadow-sm overflow-x-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold uppercase text-zinc-900">Inventario de Productos</h3>
          </div>
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="text-zinc-400 border-b"><th class="pb-2">Producto</th><th class="pb-2">Precio</th><th class="pb-2">Stock</th><th class="pb-2">Emoji</th><th class="pb-2 text-right">Acción</th></tr>
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

  tabla.innerHTML = servicios
    .map((servicio) => {
      const showIcon = servicio.id === 'visita' || servicio.id === 'caminadora';
      const iconVal = preciosServiciosLocal[`${servicio.id}Icono`] || '';
      return `
      <tr class="border-b hover:bg-zinc-50">
        <td class="py-3 font-bold text-zinc-800">${servicio.label}</td>
        <td class="py-3 text-center"><input type="number" data-precio-id="${servicio.id}" value="${preciosServiciosLocal[servicio.id] ?? 0}" class="w-32 border rounded-lg p-1 text-center font-bold bg-zinc-50 text-xs" /></td>
        <td class="py-3 text-center">${showIcon ? `<select data-precio-id-icon="${servicio.id}" class="bg-transparent text-xl outline-none"><option value="">-</option><option value="🎫" ${iconVal==='🎫' ? 'selected' : ''}>🎫</option><option value="🎟️" ${iconVal==='🎟️' ? 'selected' : ''}>🎟️</option><option value="🏃" ${iconVal==='🏃' ? 'selected' : ''}>🏃</option></select>` : ''}</td>
        <td class="py-3 text-right"><button type="button" data-id="${servicio.id}" class="btn-servicio-save bg-zinc-900 text-white px-2.5 py-1 rounded-xl text-[11px] font-bold">Guardar</button></td>
      </tr>
    `;
    })
    .join('');

  tabla.querySelectorAll('.btn-servicio-save').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      const input = tabla.querySelector(`input[data-precio-id="${id}"]`);
      const inputIcon = tabla.querySelector(`select[data-precio-id-icon="${id}"]`);
      if (!id || !input) return;
      const precio = Number(input.value);
      if (precio < 0) {
        if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje('Ingresa un precio válido.', 'error'); else alert('Ingresa un precio válido.');
        return;
      }

      try {
        const payload = { [id]: precio };
        if (inputIcon && inputIcon.value) payload[`${id}Icono`] = inputIcon.value;
        await setDoc(refServiciosPrecios, payload, { merge: true });
        preciosServiciosLocal = { ...preciosServiciosLocal, ...payload };
        renderServiciosAdmin();
        if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje('Precio de servicio guardado.', 'success'); else alert('Precio de servicio guardado.');
      } catch (error) {
        console.error(error);
        if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje('Error al guardar precio', 'error'); else alert('Error al guardar precio');
      }
    };
  });
}

function renderProductosCatalogoAdmin() {
  const tabla = document.getElementById('tabla-productos-editables-admin');
  if (!tabla) return;

  const productosFisicos = productosVentaRapidaAdmin.filter((p) => p.tipo !== 'servicio');
  if (productosFisicos.length === 0) {
    tabla.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-zinc-400">No hay productos físicos registrados.</td></tr>`;
    return;
  }

  tabla.innerHTML = productosFisicos
    .map((p) => `
      <tr class="border-b hover:bg-zinc-50">
        <td class="py-3 font-bold text-zinc-800"><span class="truncate">${p.nombre}</span></td>
        <td class="py-3 text-center"><input type="number" value="${p.precio}" data-precio-id="${p.id}" class="w-20 border rounded-lg p-1 text-center font-bold bg-zinc-50 text-xs" /></td>
        <td class="py-3 text-center"><input type="number" value="${p.stock ?? 0}" data-stock-id="${p.id}" class="w-16 border rounded-lg p-1 text-center font-bold bg-zinc-50 text-xs" /></td>
        <td class="py-3 text-center">
          <select data-icon-id="${p.id}" class="w-12 text-lg bg-transparent border-none outline-none p-0">
            <option value="🥤" ${p.icono === '🥤' ? 'selected' : ''}>🥤</option>
            <option value="🚰" ${p.icono === '🚰' ? 'selected' : ''}>🚰</option>
            <option value="🍫" ${p.icono === '🍫' ? 'selected' : ''}>🍫</option>
            <option value="🍏" ${p.icono === '🍏' ? 'selected' : ''}>🍏</option>
            <option value="💊" ${p.icono === '💊' ? 'selected' : ''}>💊</option>
            <option value="🥛" ${p.icono === '🥛' ? 'selected' : ''}>🥛</option>
            <option value="⚡" ${p.icono === '⚡' ? 'selected' : ''}>⚡</option>
            <option value="👕" ${p.icono === '👕' ? 'selected' : ''}>👕</option>
            <option value="👖" ${p.icono === '👖' ? 'selected' : ''}>👖</option>
            <option value="👜" ${p.icono === '👜' ? 'selected' : ''}>👜</option>
            <option value="🩳" ${p.icono === '🩳' ? 'selected' : ''}>🩳</option>
            <option value="🧢" ${p.icono === '🧢' ? 'selected' : ''}>🧢</option>
            <option value="🏋️" ${p.icono === '🏋️' ? 'selected' : ''}>🏋️</option>
            <option value="🛍️" ${p.icono === '🛍️' ? 'selected' : ''}>🛍️</option>
            <option value="🎟️" ${p.icono === '🎟️' ? 'selected' : ''}>🎟️</option>
          </select>
        </td>
        <td class="py-3 text-right">
          <div class="inline-flex gap-1 justify-end">
            <button data-id="${p.id}" class="btn-admin-save-item bg-zinc-900 text-white px-2.5 py-1 rounded-xl text-[11px] font-bold">Guardar</button>
            <button data-id="${p.id}" class="btn-admin-delete-item bg-red-50 text-red-600 px-2.5 py-1 rounded-xl text-[11px]">Eliminar</button>
          </div>
        </td>
      </tr>
    `)
    .join('');

  const formWrapper = document.getElementById('wrapper-form-add-producto');
  const btnMostrarAdd = document.getElementById('btn-mostrar-formulario-add');
  const btnCancelarAdd = document.getElementById('btn-admin-cancelar-add');
  const btnGuardarAdd = document.getElementById('btn-admin-guardar-add');

  if (btnMostrarAdd && formWrapper) btnMostrarAdd.onclick = () => formWrapper.classList.toggle('hidden');
  if (btnCancelarAdd && formWrapper) btnCancelarAdd.onclick = () => formWrapper.classList.add('hidden');

  if (btnGuardarAdd) {
    btnGuardarAdd.onclick = async () => {
      const nombreInput = document.getElementById('add-admin-nombre');
      const precioInput = document.getElementById('add-admin-precio');
      const tipoInput = document.getElementById('add-admin-tipo');
      const stockInput = document.getElementById('add-admin-stock');
      const iconoSelect = document.getElementById('add-admin-icono');
      if (!nombreInput || !precioInput || !tipoInput) return;

      const nombre = nombreInput.value.trim();
      const precio = Number(precioInput.value);
      const tipo = tipoInput.value;
      const stock = tipo === 'servicio' ? 0 : Number(stockInput?.value || 0);
      const icono = tipo === 'servicio' ? '🎫' : (iconoSelect?.value || '📦');
      if (!nombre || precio < 0) {
        if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje('Ingresa datos válidos.', 'error'); else alert('Ingresa datos válidos.');
        return;
      }

      try {
        await addDoc(collection(db, 'productos'), { nombre, precio, tipo, stock, icono });
        if (formWrapper) formWrapper.classList.add('hidden');
        if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje(`Producto guardado: ${nombre}`, 'success'); else alert(`✅ ¡Guardado con éxito!\n"${nombre}" se ha registrado en Firestore.`);
      } catch (error) {
        console.error(error);
        if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje('Error al guardar producto', 'error'); else alert('Error al guardar producto');
      }
    };
  }

  tabla.querySelectorAll('.btn-admin-save-item').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;
      const inputPrecio = tabla.querySelector(`input[data-precio-id="${id}"]`);
      const inputStock = tabla.querySelector(`input[data-stock-id="${id}"]`);
      const inputIcono = tabla.querySelector(`select[data-icon-id="${id}"]`);
      const producto = productosVentaRapidaAdmin.find((item) => item.id === id);
      if (!inputPrecio || !producto) return;

      const updateData = { precio: Number(inputPrecio.value) };
      if (producto.tipo !== 'servicio' && inputStock) {
        updateData.stock = Number(inputStock.value);
      }
      if (inputIcono) updateData.icono = inputIcono.value;

      try {
        await updateDoc(doc(db, 'productos', id), updateData);
        if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje('Cambios guardados', 'success'); else alert('Cambios respaldados de forma permanente.');
      } catch (error) {
        console.error(error);
        if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje('Error al guardar cambios', 'error'); else alert('Error al guardar cambios');
      }
    };
  });

  tabla.querySelectorAll('.btn-admin-delete-item').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;
      if (!confirm('¿Deseas eliminar este producto de la nube permanentemente?')) return;
      try {
        await deleteDoc(doc(db, 'productos', id));
      } catch (error) {
        console.error(error);
      }
    };
  });
}

function cargarPantallaSeguridad() {
  destruirGraficosEstructurales();
  if (!contenedorPantallas) return;

  contenedorPantallas.innerHTML = `
    <div class="max-w-md space-y-4 select-none">
      <div>
        <h2 class="text-2xl font-black">Ajustes de Llave Maestra</h2>
        <p class="text-zinc-500 text-xs">Actualización de PIN de seguridad del gimnasio.</p>
        <p id="seguridad-ultima-guardado" class="text-zinc-500 text-[11px]">Cargando última actualización...</p>
      </div>
      <form id="form-admin-security" class="bg-white border p-5 rounded-3xl space-y-3 shadow-sm">
        <div><label class="block text-[10px] font-bold text-zinc-400">Contraseña Nueva</label><input type="password" id="new-p" required class="w-full border rounded-xl p-2 text-xs outline-none focus:border-red-500"></div>
        <button type="submit" class="w-full py-2 bg-zinc-900 text-white font-bold text-xs rounded-xl shadow-md">ACTUALIZAR LLAVE</button>
      </form>
    </div>
  `;

  async function actualizarUltimaGuardadoSeguridad() {
    try {
      const docSnap = await getDoc(refCredenciales);
      if (!docSnap.exists()) return;
      const datos = docSnap.data();
      const elemento = document.getElementById('seguridad-ultima-guardado');
      if (!elemento) return;
      const fechaTexto = datos.ultimaActualizacion?.toDate ? datos.ultimaActualizacion.toDate().toLocaleString('es-ES') : 'No disponible';
      elemento.textContent = `Última vez guardado en DB: ${fechaTexto}`;
    } catch (error) {
      console.error(error);
    }
  }

  const form = document.getElementById('form-admin-security');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const np = document.getElementById('new-p')?.value.trim();
    if (!np || np.length < 4) {
      if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje('Mínimo 4 caracteres', 'error'); else alert('Mínimo 4 caracteres');
      return;
    }
    try {
      await setDoc(
        doc(db, 'configuracion', 'credenciales'),
        { password: np, nacimiento: datosSeguridadLocal?.nacimiento || '2026-01-01', ultimaActualizacion: serverTimestamp() },
        { merge: true }
      );
      if (window.mostrarSnackbarMensaje) window.mostrarSnackbarMensaje('PIN modificado con éxito.', 'success'); else alert('PIN Modificado con éxito.');
      form.reset();
      actualizarUltimaGuardadoSeguridad();
    } catch (error) {
      console.error(error);
    }
  };

  actualizarUltimaGuardadoSeguridad();
}

function MarcarBotonYTab(b, f) {
  [btnEstadisticas, btnRoles, btnSeguridad, btnPrincipal, btnMembresias, btnDinamicas].forEach((btn) => {
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
