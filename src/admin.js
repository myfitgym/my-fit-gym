import { db } from './firebase.js';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';

const contenedorPantallas = document.getElementById('contenedor-pantallas');
const btnEstadisticas = document.getElementById('btn-estadisticas');
const btnRoles = document.getElementById('btn-roles'); 
const btnSeguridad = document.getElementById('btn-seguridad');

const btnPrincipal = document.getElementById('btn-principal');
const btnMembresias = document.getElementById('btn-membresias');
const btnDinamicas = document.getElementById('btn-dinamicas');

const productosVentaRapida = [
  { nombre: 'Botella de Agua', precio: 15 }, { nombre: 'Refill de Agua', precio: 5 },
  { nombre: 'Monster Energy', precio: 45 }, { nombre: 'Amper', precio: 20 },
  { nombre: 'Snack Barra', precio: 25 }, { nombre: 'Visita Gym', precio: 50 }
];

let desuscribirDashboard = null;
let filtroTemporalActual = 'mes';
let datosSeguridadLocal = null;
let accesoConcedidoAdmin = false; 

// Instancias de Chart.js para evitar el error de "Canvas already in use"
let chartLineaAdmin = null;
let chartDonaAdmin = null;

// Descarga síncrona/asíncrona inicial de las credenciales de Firebase
const refCredenciales = doc(db, "configuracion", "credenciales");
getDoc(refCredenciales).then((docSnap) => {
  if (docSnap.exists()) {
    datosSeguridadLocal = docSnap.data();
  } else {
    datosSeguridadLocal = { password: "rodeo2026", nacimiento: "2026-01-01" };
  }
}).catch(err => {
  console.error("Error al obtener credenciales de Firebase:", err);
  datosSeguridadLocal = { password: "rodeo2026", nacimiento: "2026-01-01" };
});

// Forzar el cambio visual de la cabecera del perfil cuando entra a Gerencia
function ajustarPerfilAdmin() {
  document.getElementById('usuario-nombre').textContent = "Dueño Rodeo";
  document.getElementById('usuario-rol').textContent = "Administrador";
}

function verificarFiltroSeguridadAcceso(funcionDestino, botonActivar) {
  ajustarPerfilAdmin();
  
  if (accesoConcedidoAdmin) {
    MarcarBotonYTab(botonActivar, funcionDestino);
    return;
  }

  const claveMaestra = datosSeguridadLocal && datosSeguridadLocal.password ? datosSeguridadLocal.password : "rodeo2026";
  const nacimientoMaestro = datosSeguridadLocal && datosSeguridadLocal.nacimiento ? datosSeguridadLocal.nacimiento : "2026-01-01";

  const pin = prompt("🔒 Módulo Gerencial. Ingrese contraseña de Administrador:");
  
  if (pin === null) return; // Cancelado limpiamente

  if (pin === claveMaestra) {
    accesoConcedidoAdmin = true; 
    MarcarBotonYTab(botonActivar, funcionDestino);
  } else {
    const recup = confirm("❌ Clave incorrecta. ¿Deseas usar tu fecha de nacimiento para recuperar acceso?");
    if (recup) {
      const f = prompt("🎂 Ingrese su fecha de nacimiento (Formato: AAAA-MM-DD):");
      if (f === nacimientoMaestro) {
        alert(`Tu contraseña es: "${claveMaestra}"`);
        accesoConcedidoAdmin = true; 
        MarcarBotonYTab(botonActivar, funcionDestino);
      } else if (f !== null) {
        alert("❌ Fecha incorrecta.");
      }
    }
  }
}

function cargarPantallaEstadisticas() {
  if (desuscribirDashboard) desuscribirDashboard();
  contenedorPantallas.innerHTML = `
    <div class="space-y-6 pb-8">
      <div class="flex items-center justify-between">
        <div><h2 class="text-2xl font-black">Estadisticas de My Fit Gym Rodeo</h2><p class="text-zinc-500 text-xs">Inteligencia de caja calculada desde Firestore.</p></div>
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
    </div>
  `;
  
  document.getElementById('slicer-hoy').onclick = () => { filtroTemporalActual = 'hoy'; procesarGraficosSlicers(); };
  document.getElementById('slicer-semana').onclick = () => { filtroTemporalActual = 'semana'; procesarGraficosSlicers(); };
  document.getElementById('slicer-mes').onclick = () => { filtroTemporalActual = 'mes'; procesarGraficosSlicers(); };
  document.getElementById('slicer-anio').onclick = () => { filtroTemporalActual = 'anio'; procesarGraficosSlicers(); };

  procesarGraficosSlicers();
}

function procesarGraficosSlicers() {
  const ahora = new Date(); 
  const anioPasado = ahora.getFullYear() - 1;
  
  desuscribirDashboard = onSnapshot(collection(db, "ventas"), (snap) => {
    let total = 0; let prod = 0; let mbs = 0; let count = 0;
    const montosBarras = [];
    const etiquetasBarras = [];

    snap.forEach(d => {
      const data = d.data(); if(!data.fecha) return;
      const fDoc = data.fecha.toDate();
      
      if(fDoc.getFullYear() < anioPasado) { deleteDoc(doc(db, "ventas", d.id)); return; } 
      
      total += data.monto || 0; 
      if(data.tipo === 'producto') prod += data.monto || 0;
      if(data.tipo === 'membresia') mbs += data.monto || 0;
      count++;

      if (montosBarras.length < 7) {
        montosBarras.push(data.monto || 0);
        etiquetasBarras.push((data.concepto || "Venta").substring(0, 10) + "...");
      }
    });

    if(document.getElementById('kpi-ingreso-mes')) {
      document.getElementById('kpi-ingreso-mes').textContent = `$${total.toFixed(2)}`;
      document.getElementById('kpi-productos-monto').textContent = `$${prod.toFixed(2)}`;
      document.getElementById('kpi-ticket-promedio').textContent = `$${(count > 0 ? total/count : 0).toFixed(2)}`;
    }

    if (window.Chart) {
      const ctxL = document.getElementById('chart-linea-ingresos');
      if (ctxL) {
        if (chartLineaAdmin) chartLineaAdmin.destroy();
        chartLineaAdmin = new Chart(ctxL, {
          type: 'bar',
          data: { labels: etiquetasBarras, datasets: [{ data: montosBarras, backgroundColor: '#D32F2F', borderRadius: 6 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
      }

      const ctxD = document.getElementById('chart-dona-mix');
      if (ctxD) {
        if (chartDonaAdmin) chartDonaAdmin.destroy();
        chartDonaAdmin = new Chart(ctxD, {
          type: 'doughnut',
          data: { labels: ['Membresías', 'Productos'], datasets: [{ data: [mbs, prod], backgroundColor: ['#121212', '#D32F2F'], borderWidth: 0 }] },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }
    }
  });
}

function cargarPantallaRoles() {
  if (desuscribirDashboard) desuscribirDashboard();
  contenedorPantallas.innerHTML = `
    <div class="space-y-4 max-w-md select-none">
      <div><h2 class="text-2xl font-black">Catálogo Mostrador</h2><p class="text-zinc-500 text-xs">Precios informativos vigentes de los artículos de barra.</p></div>
      <div class="bg-white border rounded-3xl p-4 shadow-sm space-y-2.5">
        ${productosVentaRapida.map(p => `<div class="flex justify-between p-2.5 bg-zinc-50 rounded-xl font-bold border text-xs"><span>${p.nombre}</span><span class="bg-zinc-900 text-white px-2 py-0.5 rounded-md">$${p.precio}.00</span></div>`).join('')}
      </div>
    </div>
  `;
}

function cargarPantallaSeguridad() {
  if (desuscribirDashboard) desuscribirDashboard();
  contenedorPantallas.innerHTML = `
    <div class="max-w-md space-y-4 select-none">
      <div>
        <h2 class="text-2xl font-black">Ajustes de Llave Maestra</h2>
        <p class="text-zinc-500 text-xs">Actualización de PIN de seguridad del gimnasio.</p>
        <p id="seguridad-ultima-guardado" class="text-zinc-500 text-[11px]">Cargando última actualización...</p>
      </div>
      <form id="form-admin-security" class="bg-white border p-5 rounded-3xl space-y-3 shadow-sm">
        <div><label class="block text-[10px] font-bold text-zinc-400">Contraseña Nueva</label><input type="password" id="new-p" required class="w-full border rounded-xl p-2 text-xs"></div>
        <button type="submit" class="w-full py-2 bg-zinc-900 text-white font-bold text-xs rounded-xl shadow-md">ACTUALIZAR LLAVE</button>
      </form>
    </div>
  `;
  actualizarUltimaGuardadoSeguridad();
  async function actualizarUltimaGuardadoSeguridad() {
    try {
      const docSnap = await getDoc(refCredenciales);
      if (!docSnap.exists()) return;
      const datos = docSnap.data();
      const elemento = document.getElementById('seguridad-ultima-guardado');
      if (!elemento) return;
      let fechaTexto = '';
      if (datos.ultimaActualizacion && typeof datos.ultimaActualizacion.toDate === 'function') {
        fechaTexto = datos.ultimaActualizacion.toDate().toLocaleString('es-ES');
      } else if (docSnap.updateTime) {
        fechaTexto = docSnap.updateTime.toDate().toLocaleString('es-ES');
      }
      elemento.textContent = fechaTexto ? `Última vez guardado en DB: ${fechaTexto}` : 'Última vez guardado en DB: no disponible';
    } catch (err) {
      console.error('Error al leer última actualización de seguridad:', err);
    }
  }
  document.getElementById('form-admin-security').onsubmit = async (e) => {
    e.preventDefault(); const np = document.getElementById('new-p').value.trim();
    if(np.length < 4) return alert("Mínimo 4 caracteres");
    await setDoc(doc(db, "configuracion", "credenciales"), { password: np, nacimiento: datosSeguridadLocal ? datosSeguridadLocal.nacimiento : "2026-01-01", ultimaActualizacion: serverTimestamp() });
    alert("PIN Modificado con éxito."); e.target.reset();
    actualizarUltimaGuardadoSeguridad();
  };
}

function MarcarBotonYTab(b, f) {
  [btnEstadisticas, btnRoles, btnSeguridad, btnPrincipal, btnMembresias, btnDinamicas].forEach(btn => {
    if(btn) btn.className = "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition text-zinc-400 hover:bg-zinc-900 hover:text-white font-medium";
  });
  if(b) b.className = "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition bg-[#D32F2F] text-white font-medium shadow-md";
  f();
}

function destruirGraficosEstructurales() {
  if (desuscribirDashboard) { desuscribirDashboard(); desuscribirDashboard = null; }
  if (chartLineaAdmin) { chartLineaAdmin.destroy(); chartLineaAdmin = null; }
  if (chartDonaAdmin) { chartDonaAdmin.destroy(); chartDonaAdmin = null; }
}

// =======================================================
// OYENTES DE EVENTOS DE INTERCOMUNICACIÓN DE MAIN.JS
// =======================================================
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