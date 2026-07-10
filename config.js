// Configuración de la app Gin Malcriado.
// La URL del servidor y la clave se guardan en el celular (Ajustes ⚙︎),
// pero puedes dejar aquí un valor por defecto cuando tengamos el cerebro listo.
window.MALCRIADO_CONFIG = {
  // Cerebro en la nube (Google Apps Script) — ya desplegado:
  API_URL_DEFAULT: "https://script.google.com/macros/s/AKfycbzD5_awY5kYmhuKOUcmK5ewU4uSlPtstK74gzQsBxjPpzeqLu43iU-dyFS9YhcM6a01oA/exec",
  API_KEY_DEFAULT: "Malcriado-Branican-2026",

  // Productos de Bsale: id = VARIANTE real (afecta a IVA) que se envia a Bsale.
  // 700ml=6 (Botella 700ml), 250ml=8, 750ml=20, Granel=12.
  // El precio es con IVA incluido y editable en la app.
  PRODUCTOS: [
    { id: 6,  nombre: "Gin Malcriado 700ml", precio: 24990 },
    { id: 8,  nombre: "Gin Malcriado 250ml", precio: 0 },
    { id: 20, nombre: "Malcriado 750ml",     precio: 0 },
    { id: 12, nombre: "Malcriado Granel",    precio: 0 }
  ],

  IVA: 0.19,
  ILA: 0.315
};
