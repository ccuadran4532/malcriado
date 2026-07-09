/* App Gin Malcriado — lógica de ventas (diseño Indomable) */

/* AUTO-REINSTALACIÓN (una sola vez): al abrir, borra TODO el estado viejo
   —clave mala guardada, caché y service workers— y recarga la app limpia.
   Así se "reinstala sola" sin que el usuario tenga que borrar nada. */
(function autoReset() {
  try {
    if (localStorage.getItem("reset_v24") === "1") return;   // ya limpiada
    try { localStorage.removeItem("api_key"); localStorage.removeItem("api_url"); } catch (e) {}
    var terminar = function () {
      try { localStorage.setItem("reset_v24", "1"); } catch (e) {}
      location.reload();
    };
    var tareas = [];
    if (window.caches && caches.keys) {
      tareas.push(caches.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) { return caches.delete(k); }));
      }));
    }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      tareas.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
        return Promise.all(rs.map(function (r) { return r.unregister(); }));
      }));
    }
    if (tareas.length) { Promise.all(tareas).then(terminar).catch(terminar); }
    else { try { localStorage.setItem("reset_v24", "1"); } catch (e) {} }
  } catch (e) {}
})();

(function () {
  "use strict";
  const C = window.MALCRIADO_CONFIG;
  const $ = (id) => document.getElementById(id);

  // --- Estado ---
  let tipo = "boleta";
  let cantidad = 1;
  let enviando = false;
  let ventaPendiente = null;

  // --- Conexión ---
  // La clave/URL de fábrica (config.js) SIEMPRE mandan. Antes ganaba lo guardado
  // en el teléfono, y una clave vieja con un carácter invisible tapaba la buena
  // (daba "Clave incorrecta" sin forma fácil de arreglarlo). Ahora es a prueba de eso.
  const store = {
    get url() { return C.API_URL_DEFAULT || localStorage.getItem("api_url") || ""; },
    set url(v) { localStorage.setItem("api_url", (v || "").trim()); },
    get key() { return C.API_KEY_DEFAULT || localStorage.getItem("api_key") || ""; },
    set key(v) { localStorage.setItem("api_key", (v || "").trim()); },
  };
  // Auto-reparación: limpia cualquier clave/URL vieja que quedó guardada de antes.
  try { localStorage.removeItem("api_key"); localStorage.removeItem("api_url"); } catch (e) {}

  // --- Utilidades ---
  const fmt = (n) => "$" + Math.round(n).toLocaleString("es-CL");

  function precioActual() { return parseInt(String($("precio").value).replace(/\D/g, ""), 10) || 0; }
  function pintarPrecio(n) { $("precio").value = n > 0 ? "$" + Number(n).toLocaleString("es-CL") : ""; }
  function precioDefecto() {
    const sel = $("producto"), op = sel.options[sel.selectedIndex];
    const pr = op ? (+op.dataset.precio || 0) : 0;
    return pr > 0 ? pr : 24990; // precio de mercado por defecto
  }

  function calcular() {
    // El precio que se digita YA INCLUYE IVA (precio final). Aquí se desglosa.
    const brutoUnit = precioActual();
    const aplicaIla = $("ila").checked;
    const aplicaIva = $("iva").checked;
    // ILA e IVA van cada uno SOBRE EL NETO y NO se suman entre sí (el IVA no se calcula sobre el ILA)
    const factor = 1 + (aplicaIla ? C.ILA : 0) + (aplicaIva ? C.IVA : 0);
    const brutoTotal = brutoUnit * cantidad;       // total con impuestos
    const netoTotal = brutoTotal / factor;         // se "saca" el IVA (y el ILA si aplica)
    const ila = aplicaIla ? netoTotal * C.ILA : 0;
    const iva = aplicaIva ? (brutoTotal - netoTotal - ila) : 0;
    $("rNeto").textContent = fmt(netoTotal);
    $("rIla").textContent = fmt(ila);
    $("rIva").textContent = fmt(iva);
    $("rTotal").textContent = fmt(brutoTotal);
    $("rRowIla").style.opacity = aplicaIla ? 1 : 0.4;
    return { brutoUnit, netoUnit: netoTotal / cantidad, netoTotal, ila, iva, total: brutoTotal, aplicaIla, aplicaIva };
  }

  // --- RUT chileno: acepta con/sin puntos y con/sin dígito verificador ---
  function soloRut(r) { return String(r || "").replace(/[^0-9kK]/g, "").toUpperCase(); }
  function puntos(c) { return c.replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function dvDe(cuerpo) {
    let suma = 0, mul = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) { suma += parseInt(cuerpo[i], 10) * mul; mul = mul === 7 ? 2 : mul + 1; }
    const res = 11 - (suma % 11);
    return res === 11 ? "0" : res === 10 ? "K" : String(res);
  }
  // Formato suave mientras se escribe (todavía NO calcula el dígito verificador)
  function formatRutVivo(raw) {
    raw = String(raw || "").replace(/[^0-9kK.\-]/g, "");
    if (raw.indexOf("-") !== -1) {
      const i = raw.indexOf("-");
      const cuerpo = raw.slice(0, i).replace(/\D/g, "");
      const dv = raw.slice(i + 1).replace(/[^0-9kK]/g, "").toUpperCase().slice(0, 1);
      return (cuerpo ? puntos(cuerpo) : "") + "-" + dv;
    }
    const limpio = raw.replace(/[^0-9kK]/g, "").toUpperCase();
    const finK = /K$/.test(limpio);
    return puntos(limpio.replace(/K/g, "")) + (finK ? "K" : "");
  }
  // Completa el RUT final: si no trae dígito verificador, lo calcula. Devuelve "12.345.678-5".
  function completaRut(raw) {
    raw = String(raw || "").trim();
    if (!soloRut(raw)) return "";
    let cuerpo, dv;
    if (raw.indexOf("-") !== -1) {
      const i = raw.indexOf("-");
      cuerpo = raw.slice(0, i).replace(/\D/g, "");
      const dvPart = raw.slice(i + 1).replace(/[^0-9kK]/g, "").toUpperCase();
      dv = dvPart ? dvPart.slice(-1) : dvDe(cuerpo);
    } else {
      const limpio = raw.replace(/[^0-9kK]/g, "").toUpperCase();
      if (/K$/.test(limpio) && limpio.length > 1) { cuerpo = limpio.slice(0, -1).replace(/\D/g, ""); dv = "K"; }
      else { cuerpo = limpio.replace(/\D/g, ""); dv = dvDe(cuerpo); }
    }
    if (!cuerpo) return "";
    return puntos(cuerpo) + "-" + dv;
  }
  function rutValido(r) {
    r = soloRut(r);
    if (r.length < 2) return false;
    const dv = r.slice(-1), cuerpo = r.slice(0, -1);
    if (!/^\d+$/.test(cuerpo)) return false;
    return dvDe(cuerpo) === dv;
  }

  // --- Toast ---
  let toastT;
  function toast(msg, kind) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast show " + (kind || "");
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.className = "toast"), 3200);
  }

  // IVA e ILA siempre MOVIBLES (se pueden agregar/sacar). Solo cambia el valor por defecto:
  // boleta: ILA apagado · factura: ILA encendido. El IVA queda encendido por defecto en ambos.
  function actualizarIla() {
    $("ila").disabled = false;
    $("iva").disabled = false;
    $("ila").checked = (tipo === "factura");
    $("ilaNota").textContent = "Puedes agregarlo o sacarlo";
  }

  // --- Cambiar Boleta / Factura ---
  function setTipo(t) {
    tipo = t;
    $("bBoleta").classList.toggle("on", t === "boleta");
    $("bFactura").classList.toggle("on", t === "factura");
    $("btn").textContent = t === "boleta" ? "Emitir Boleta" : "Emitir Factura";
    // RUT: obligatorio en factura, opcional en boleta
    $("campoRut").style.opacity = t === "factura" ? 1 : 0.55;
    actualizarIla();
    calcular();
  }

  // --- Poblar productos ---
  function cargarProductos() {
    const sel = $("producto");
    C.PRODUCTOS.forEach((p, i) => {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.nombre;
      o.dataset.precio = p.precio;
      if (i === 0) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => {
      const op = sel.options[sel.selectedIndex];
      const pr = +op.dataset.precio || 0;
      if (pr > 0) pintarPrecio(pr);
      calcular();
    });
  }

  // --- Enviar venta al cerebro ---
  async function emitir() {
    if (enviando) return;
    initAudio(); // desbloquea el audio dentro del gesto del usuario (toque del botón)
    const nombre = $("nombre").value.trim();
    const rut = $("rut").value.trim();
    const rutFull = completaRut(rut); // completa el dígito verificador si no vino

    if (tipo === "factura") {
      // La factura exige nombre + RUT válido (obligación legal del SII)
      if (!nombre) { toast("La factura necesita el nombre", "bad"); return; }
      if (!rutFull) { toast("La factura necesita RUT", "bad"); return; }
      if (!rutValido(rutFull)) { $("hintRut").classList.add("show"); $("campoRut").classList.add("error"); toast("RUT inválido", "bad"); return; }
      $("rut").value = rutFull;
    } else {
      // Boleta: se emite y se guarda igual aunque falten datos.
      // Si hay RUT y es válido, lo dejamos completo; si está mal escrito, no bloqueamos.
      if (rut && rutValido(rutFull)) $("rut").value = rutFull;
    }
    const calc = calcular();
    if (calc.brutoUnit <= 0) { toast("Ingresa un precio válido", "bad"); return; }

    if (!store.url) { toast("Primero configura la conexión ⚙︎", "bad"); abrirSheet(); return; }

    const sel = $("producto").options[$("producto").selectedIndex];
    const payload = {
      clave: store.key,
      tipo: tipo,                       // "boleta" | "factura"
      producto_id: +$("producto").value,
      producto_nombre: sel.textContent,
      nombre: nombre,
      rut: rutFull,
      rut_valido: rut ? rutValido(rutFull) : false,
      precio_neto: Math.round(calc.netoUnit * 100) / 100, // neto unitario (sin IVA) para Bsale
      precio_con_iva: calc.brutoUnit,                      // precio unitario digitado (con IVA)
      cantidad: cantidad,
      aplica_ila: calc.aplicaIla,
      aplica_iva: calc.aplicaIva,
      // El cerebro recalcula los impuestos por seguridad; esto es referencia:
      ref_total: Math.round(calc.total)
    };

    // No emitimos directo: pedimos confirmación ("Malcriados") para no equivocarse
    ventaPendiente = { payload: payload, total: calc.total };
    mostrarConfirmacion(payload, calc.total);
  }

  // Cuadro de confirmación con el botón "Malcriados"
  function mostrarConfirmacion(payload, total) {
    $("cfDoc").textContent = (payload.tipo === "factura" ? "Factura" : "Boleta");
    $("cfCli").textContent = payload.nombre || "Consumidor Final";
    $("cfCant").textContent = payload.cantidad + (payload.cantidad === 1 ? " botella" : " botellas");
    $("cfTot").textContent = "$" + Math.round(total).toLocaleString("es-CL");
    $("confirmSheet").classList.add("show");
  }
  function cerrarConfirmacion() { $("confirmSheet").classList.remove("show"); }

  // Confirmación final ("Malcriados"): aquí SÍ se emite en Bsale
  async function confirmarVenta() {
    if (!ventaPendiente || enviando) return;
    const payload = ventaPendiente.payload, total = ventaPendiente.total;
    cerrarConfirmacion();
    const btn = $("btn");
    enviando = true; btn.disabled = true;
    const txtOriginal = btn.textContent;
    btn.textContent = "Emitiendo…";

    try {
      const resp = await fetch(store.url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight CORS con Apps Script
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (data && data.ok) {
        guardarVenta(payload, total, data.folio);
        btn.classList.add("ok");
        btn.textContent = "✓ " + (data.folio ? ("Emitido N° " + data.folio) : "Emitido");
        mostrarTicket(payload, total, data.folio, data);
        setTimeout(() => { btn.classList.remove("ok"); btn.textContent = txtOriginal; limpiarFormulario(); }, 2900);
      } else {
        throw new Error((data && data.error) || "Respuesta no válida");
      }
    } catch (e) {
      btn.textContent = txtOriginal;
      const sinRed = (e instanceof TypeError) || /failed to fetch|networkerror|load failed/i.test(e.message);
      toast(sinRed ? "Sin internet — revisa tu conexión e intenta de nuevo" : ("Error: " + e.message), "bad");
    } finally {
      enviando = false; btn.disabled = false; ventaPendiente = null;
    }
  }

  function limpiarFormulario() {
    $("nombre").value = "";
    $("rut").value = "";
    cantidad = 1; $("cant").textContent = cantidad;
    calcular();
  }

  // --- Sonido tipo ICQ (generado por código, sin archivos) ---
  let audioCtx;
  function initAudio() {
    try {
      if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtx = new AC(); }
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {}
  }
  function tono(freq, t0, dur, vol, tipo) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = tipo || "square"; o.frequency.value = freq;
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime + t0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.22, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function sonidoICQ() { initAudio(); tono(660, 0, 0.13, 0.25, "square"); tono(990, 0.14, 0.20, 0.25, "square"); } // "uh-oh!"
  function sonidoBotella() { initAudio(); tono(880, 0, 0.10, 0.18, "sine"); tono(1320, 0.11, 0.18, 0.18, "sine"); }

  // --- Ticket de confirmación (aparece y desaparece) ---
  let ticketT;
  function mostrarTicket(payload, total, folio, data) {
    const doc = (payload.tipo === "factura" ? "Factura" : "Boleta") + (folio ? " N° " + folio : "");
    $("tkDoc").textContent = doc;
    $("tkCli").textContent = payload.nombre || "—";
    $("tkTot").textContent = "$" + Math.round(total).toLocaleString("es-CL");
    // Solo mostramos los pasos REALMENTE realizados por el cerebro
    const pasos = ["✓ Documento emitido en Bsale"];
    if (data && data.drive) pasos.push("✓ Guardado en Google Drive");
    if (data && data.planilla) pasos.push("✓ Planilla del mes actualizada");
    $("tkPasos").innerHTML = pasos.map((p) => "<div>" + p + "</div>").join("");
    const ov = $("ticket");
    ov.classList.add("show");
    sonidoICQ();
    clearTimeout(ticketT);
    ticketT = setTimeout(() => { ov.classList.remove("show"); mostrarBotella(); }, 2700);
  }

  // --- Botella Malcriado: aparece tras el ticket y se desvanece ---
  let botellaT = [];
  function mostrarBotella() {
    const ov = $("botella");
    botellaT.forEach(clearTimeout); botellaT = [];
    ov.classList.remove("fade");
    ov.classList.add("show");
    sonidoBotella();
    botellaT.push(setTimeout(() => ov.classList.add("fade"), 1900));        // permanece y luego...
    botellaT.push(setTimeout(() => ov.classList.remove("show", "fade"), 3900)); // fade de 2 seg
  }

  // --- Historial (guardado en el celular) ---
  function leerHistorial() {
    try { return JSON.parse(localStorage.getItem("historial") || "[]"); } catch (e) { return []; }
  }
  function guardarVenta(payload, total, folio) {
    const lista = leerHistorial();
    lista.unshift({
      fecha: new Date().toISOString(),
      folio: folio || "",
      tipo: payload.tipo,
      cliente: payload.nombre,
      rut: payload.rut,
      producto: payload.producto_nombre,
      cantidad: payload.cantidad,
      precio_neto: payload.precio_neto,
      total: Math.round(total)
    });
    localStorage.setItem("historial", JSON.stringify(lista.slice(0, 1000)));
  }
  function fechaCorta(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) + " · " +
           d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  }
  function renderHistorial(filtro) {
    const lista = leerHistorial();
    const cont = $("listaHist");
    const norm = (s) => String(s).toLowerCase().replace(/[.\s$]/g, "");
    const q = norm(filtro || "");
    const datos = !q ? lista : lista.filter((v) => {
      const blob = norm([v.cliente, v.rut, v.folio, v.tipo, v.producto,
                         v.total, fechaCorta(v.fecha)].join(" "));
      return blob.includes(q);
    });
    $("histResumen").textContent = lista.length + (lista.length === 1 ? " venta" : " ventas") +
      (q ? " · " + datos.length + " encontradas" : "");
    $("histVacio").style.display = lista.length === 0 ? "block" : "none";
    $("histVacio").textContent = lista.length === 0 ? "Aún no hay ventas registradas." : "";
    cont.innerHTML = datos.map((v) => {
      const folio = v.folio ? ("N° " + v.folio) : "—";
      return '<div class="hcard"><div class="izq">' +
        '<div class="cli">' + esc(v.cliente || "Sin nombre") + '</div>' +
        '<div class="meta"><span class="tag ' + v.tipo + '">' + v.tipo + '</span>' +
        folio + ' · ' + esc(v.producto || "") + ' · ' + v.cantidad + ' u.' +
        (v.rut ? ' · ' + esc(v.rut) : '') + '</div></div>' +
        '<div class="der"><div class="monto">$' + (v.total || 0).toLocaleString("es-CL") + '</div>' +
        '<div class="fecha">' + fechaCorta(v.fecha) + '</div></div></div>';
    }).join("");
    if (q && datos.length === 0) cont.innerHTML = '<div class="vacio">Sin resultados para "' + esc(filtro) + '".</div>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // --- Navegación entre Venta e Historial ---
  let vista = "venta";
  function mostrarVista(v) {
    vista = v;
    $("vistaVenta").style.display = v === "venta" ? "" : "none";
    $("footerVenta").style.display = v === "venta" ? "" : "none";
    $("vistaHistorial").style.display = v === "historial" ? "" : "none";
    $("btnHist").textContent = v === "venta" ? "🕘" : "←";
    if (v === "historial") { $("busca").value = ""; $("limpiaBusca").classList.remove("show"); renderHistorial(""); }
  }

  // --- Hoja de ajustes ---
  function abrirSheet() {
    $("apiUrl").value = store.url;
    $("apiKey").value = store.key;
    $("estadoConn").textContent = "";
    $("sheet").classList.add("show");
  }
  function cerrarSheet() { $("sheet").classList.remove("show"); }

  async function guardarConn() {
    store.url = $("apiUrl").value;
    store.key = $("apiKey").value;
    const est = $("estadoConn");
    if (!store.url) { est.className = "estado bad"; est.textContent = "Falta la URL"; return; }
    est.className = "estado"; est.textContent = "Probando conexión…";
    try {
      const r = await fetch(store.url + (store.url.includes("?") ? "&" : "?") + "ping=1&clave=" + encodeURIComponent(store.key));
      const d = await r.json();
      if (d && d.ok) { est.className = "estado"; est.textContent = "✓ Conectado correctamente"; setTimeout(cerrarSheet, 900); }
      else { est.className = "estado bad"; est.textContent = "Respondió pero sin OK"; }
    } catch (e) {
      est.className = "estado bad"; est.textContent = "No se pudo conectar (revisa la URL)";
    }
  }

  // --- Eventos ---
  function init() {
    cargarProductos();
    $("bBoleta").addEventListener("click", () => setTipo("boleta"));
    $("bFactura").addEventListener("click", () => setTipo("factura"));
    $("menos").addEventListener("click", () => { cantidad = Math.max(1, cantidad - 1); $("cant").textContent = cantidad; calcular(); });
    $("mas").addEventListener("click", () => { cantidad += 1; $("cant").textContent = cantidad; calcular(); });
    $("precio").addEventListener("input", () => { pintarPrecio(precioActual()); calcular(); });
    $("precio").addEventListener("focus", () => { $("precio").value = ""; });   // se borra al tocarlo
    $("precio").addEventListener("blur", () => { if (!precioActual()) pintarPrecio(precioDefecto()); calcular(); }); // vuelve a $24.990 si queda vacío
    $("ila").addEventListener("change", calcular);
    $("iva").addEventListener("change", calcular);
    $("rut").addEventListener("input", (e) => {
      e.target.value = formatRutVivo(e.target.value);
      $("hintRut").classList.remove("show"); $("campoRut").classList.remove("error");
    });
    // Al salir del campo, completa el dígito verificador si faltó
    $("rut").addEventListener("blur", () => {
      const v = completaRut($("rut").value);
      if (v) $("rut").value = v;
    });
    $("btn").addEventListener("click", emitir);
    $("btnConfirmar").addEventListener("click", confirmarVenta);
    $("btnCancelarEmision").addEventListener("click", cerrarConfirmacion);
    $("confirmSheet").addEventListener("click", (e) => { if (e.target === $("confirmSheet")) cerrarConfirmacion(); });
    $("btnHist").addEventListener("click", () => mostrarVista(vista === "venta" ? "historial" : "venta"));
    $("busca").addEventListener("input", (e) => {
      $("limpiaBusca").classList.toggle("show", !!e.target.value);
      renderHistorial(e.target.value);
    });
    $("limpiaBusca").addEventListener("click", () => { $("busca").value = ""; $("limpiaBusca").classList.remove("show"); renderHistorial(""); $("busca").focus(); });
    $("btnGear").addEventListener("click", abrirSheet);
    $("guardar").addEventListener("click", guardarConn);
    $("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) cerrarSheet(); });
    setTipo("boleta");
    calcular();
  }
  document.addEventListener("DOMContentLoaded", init);

  // --- Service worker (instalable) ---
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
