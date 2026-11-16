/* ==========================================================================
   Tecnobyte — interacciones
     1. Menú móvil
     2. Medidor: peso real de la página
     3. Fondo de puntos que responde al ratón
     4. Revelado de contenido al desplazarse
     5. Pestañas de los ODS y recorrido fijado
     6. Seguimiento del scroll: enlace activo, progreso ASG y recorrido ODS
     7. Formulario de contacto (redacta el mensaje, no envía nada)
   ========================================================================== */

// La clase "js" permite que el CSS muestre todo el contenido si no hay JavaScript.
const raiz = document.documentElement;
raiz.classList.add('js');

const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 1. MENÚ MÓVIL ------------------------------------------------------------ */
const botonMenu = document.querySelector('.menu-boton');
const nav = document.querySelector('#navegacion');

function cerrarMenu() {
  nav.classList.remove('abierta');
  botonMenu.setAttribute('aria-expanded', 'false');
}

botonMenu.addEventListener('click', () => {
  const abierta = nav.classList.toggle('abierta');
  botonMenu.setAttribute('aria-expanded', String(abierta));
});

// Al elegir un enlace o pulsar Escape, el menú se cierra.
nav.addEventListener('click', (evento) => {
  if (evento.target.closest('a')) cerrarMenu();
});

document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape' && nav.classList.contains('abierta')) {
    cerrarMenu();
    botonMenu.focus();
  }
});

/* 2. MEDIDOR DE PESO ------------------------------------------------------- */
// Usa la API Performance del navegador: son los bytes que de verdad se han
// descargado para mostrar esta página. No hay ninguna cifra escrita a mano.
const TIPOS = [
  { clave: 'html', nombre: 'HTML', tono: 'var(--texto)' },
  { clave: 'css', nombre: 'CSS', tono: 'var(--lavanda)' },
  { clave: 'js', nombre: 'JavaScript', tono: 'var(--gobernanza)' },
  { clave: 'otros', nombre: 'Imágenes y otros', tono: 'var(--ambiental)' },
];

function tipoDeRecurso(entrada) {
  if (entrada.entryType === 'navigation') return 'html';
  const ruta = entrada.name.split('?')[0];
  if (ruta.endsWith('.css')) return 'css';
  if (ruta.endsWith('.js')) return 'js';
  return 'otros';
}

function formatoKB(bytes) {
  return (bytes / 1024).toLocaleString('es-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function medirPagina() {
  const elPeso = document.querySelector('#medidor-peso');
  const elBarra = document.querySelector('#medidor-barra');
  const elDesglose = document.querySelector('#medidor-desglose');
  const elNota = document.querySelector('#medidor-nota');

  const entradas = [
    ...performance.getEntriesByType('navigation'),
    ...performance.getEntriesByType('resource'),
  ];

  const porTipo = { html: 0, css: 0, js: 0, otros: 0 };
  let total = 0;
  let externas = 0;

  for (const entrada of entradas) {
    // encodedBodySize: tamaño del archivo tal como viaja por la red.
    const bytes = entrada.encodedBodySize || entrada.decodedBodySize || 0;
    porTipo[tipoDeRecurso(entrada)] += bytes;
    total += bytes;
    if (new URL(entrada.name, location.href).origin !== location.origin) externas++;
  }

  // Al abrir el archivo directamente (file://) el navegador no informa de tamaños.
  if (total === 0) {
    elNota.textContent =
      'El navegador no informa del peso cuando la página se abre como archivo local. ' +
      'Ábrela desde un servidor web para ver la medición.';
    return;
  }

  for (const tipo of TIPOS) {
    const bytes = porTipo[tipo.clave];
    if (bytes === 0) continue;

    const tramo = document.createElement('span');
    tramo.style.setProperty('--tono', tipo.tono);
    tramo.style.flexGrow = bytes;
    elBarra.append(tramo);

    const fila = document.createElement('li');
    fila.style.setProperty('--tono', tipo.tono);
    fila.append(tipo.nombre);
    const valor = document.createElement('b');
    valor.textContent = formatoKB(bytes) + ' kB';
    fila.append(valor);
    elDesglose.append(fila);
  }

  // Los archivos que el navegador ya tenía en caché no se vuelven a descargar
  // y por eso pesan 0: es la caché eficiente del compromiso A2 funcionando.
  const enCache = entradas.filter(
    (entrada) => !(entrada.encodedBodySize || entrada.decodedBodySize)
  ).length;
  const descargados = entradas.length - enCache;

  let nota = `${descargados} ${descargados === 1 ? 'archivo descargado' : 'archivos descargados'}`;
  if (enCache > 0) {
    nota += ` y ${enCache} que tu navegador ya tenía en caché`;
  }
  nota +=
    `. ${externas} ${externas === 1 ? 'petición' : 'peticiones'} a otros dominios. ` +
    'Medido ahora en tu navegador: es el peso de esta página, no un dato de impacto ambiental.';
  elNota.textContent = nota;

  // La cifra sube hasta su valor.
  if (movimientoReducido) {
    elPeso.textContent = formatoKB(total);
    return;
  }
  const duracion = 700;
  const inicio = performance.now();
  function paso(ahora) {
    const avance = Math.min((ahora - inicio) / duracion, 1);
    const suavizado = 1 - Math.pow(1 - avance, 3);
    elPeso.textContent = formatoKB(total * suavizado);
    if (avance < 1) requestAnimationFrame(paso);
  }
  requestAnimationFrame(paso);
}

// Se espera a que termine la carga para contar todos los archivos.
if (document.readyState === 'complete') setTimeout(medirPagina, 100);
else window.addEventListener('load', () => setTimeout(medirPagina, 100));

/* 3. FONDO DE PUNTOS ------------------------------------------------------- */
// Rejilla uniforme de puntos que reacciona al ratón: los puntos cercanos se
// acercan al cursor, crecen y se iluminan, toda la rejilla se desplaza un poco
// en sentido contrario (parallax) y un foco de luz sigue al puntero.
// Solo se activa con ratón y sin "movimiento reducido". En pantallas táctiles
// queda el patrón fijo de CSS (body::before), con el mismo aspecto en reposo.
function iniciarPuntos() {
  const lienzo = document.querySelector('#puntos');
  const punteroFino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!lienzo || !punteroFino || movimientoReducido) return;

  const ctx = lienzo.getContext('2d');
  const PASO = parseFloat(getComputedStyle(raiz).getPropertyValue('--puntos-paso')) || 28;
  const RADIO = 190;    // radio de influencia del ratón, en píxeles
  const ATRACCION = 0.45; // cuánto se acercan los puntos al cursor
  const PARALLAX = 14;  // desplazamiento máximo de toda la rejilla, en píxeles
  const REPOSO = 2500;  // ms sin mover el ratón tras los que se detiene la animación

  let ancho = 0;
  let alto = 0;
  let puntos = [];
  let animando = false;
  let ultimoMovimiento = 0;
  let brillo = 0; // intensidad del foco de luz, de 0 a 1
  const raton = { x: 0, y: 0, activo: false };
  const suave = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  function crearRejilla() {
    const densidad = Math.min(window.devicePixelRatio || 1, 2);
    ancho = window.innerWidth;
    alto = window.innerHeight;
    lienzo.width = ancho * densidad;
    lienzo.height = alto * densidad;
    ctx.setTransform(densidad, 0, 0, densidad, 0, 0);

    // Sobran columnas y filas por los bordes para que el parallax no deje huecos.
    const columnas = Math.ceil(ancho / PASO) + 3;
    const filas = Math.ceil(alto / PASO) + 3;
    const origenX = (ancho - (columnas - 1) * PASO) / 2;
    const origenY = (alto - (filas - 1) * PASO) / 2;
    puntos = [];
    for (let fila = 0; fila < filas; fila++) {
      for (let columna = 0; columna < columnas; columna++) {
        const x = origenX + columna * PASO;
        const y = origenY + fila * PASO;
        puntos.push({ casaX: x, casaY: y, x, y });
      }
    }
  }

  function fotograma(ahora) {
    // El foco y el parallax siguen al cursor con suavidad.
    const destinoX = raton.activo ? raton.x : ancho / 2;
    const destinoY = raton.activo ? raton.y : alto / 2;
    suave.x += (destinoX - suave.x) * 0.08;
    suave.y += (destinoY - suave.y) * 0.08;
    brillo += ((raton.activo ? 1 : 0) - brillo) * 0.08;

    const desvioX = -(suave.x / ancho - 0.5) * PARALLAX * 2;
    const desvioY = -(suave.y / alto - 0.5) * PARALLAX * 2;

    ctx.clearRect(0, 0, ancho, alto);

    // Foco de luz alrededor del cursor
    if (brillo > 0.01) {
      const foco = ctx.createRadialGradient(suave.x, suave.y, 0, suave.x, suave.y, 420);
      foco.addColorStop(0, `rgba(168, 85, 247, ${(0.2 * brillo).toFixed(3)})`);
      foco.addColorStop(1, 'rgba(168, 85, 247, 0)');
      ctx.fillStyle = foco;
      ctx.fillRect(suave.x - 420, suave.y - 420, 840, 840);
    }

    for (const punto of puntos) {
      let x = punto.casaX + desvioX;
      let y = punto.casaY + desvioY;
      let cercania = 0; // 1 junto al cursor, 0 fuera del radio

      if (raton.activo) {
        const dx = suave.x - x;
        const dy = suave.y - y;
        const distancia = Math.hypot(dx, dy);
        if (distancia < RADIO) {
          cercania = 1 - distancia / RADIO;
          const fuerza = cercania * cercania * ATRACCION;
          x += dx * fuerza;
          y += dy * fuerza;
        }
      }

      punto.x += (x - punto.x) * 0.14;
      punto.y += (y - punto.y) * 0.14;

      ctx.fillStyle = `rgba(196, 165, 255, ${(0.17 + cercania * 0.75).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(punto.x, punto.y, 1.1 + cercania * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Si el ratón lleva un rato quieto, todo está ya en su sitio: se deja de
    // dibujar hasta el siguiente movimiento para no gastar batería.
    if (ahora - ultimoMovimiento < REPOSO) requestAnimationFrame(fotograma);
    else animando = false;
  }

  function despertar() {
    ultimoMovimiento = performance.now();
    if (animando) return;
    animando = true;
    requestAnimationFrame(fotograma);
  }

  window.addEventListener('pointermove', (evento) => {
    if (evento.pointerType !== 'mouse') return;
    raton.x = evento.clientX;
    raton.y = evento.clientY;
    raton.activo = true;
    despertar();
  }, { passive: true });

  raiz.addEventListener('pointerleave', () => {
    raton.activo = false;
    despertar();
  });

  window.addEventListener('resize', () => {
    crearRejilla();
    despertar();
  });

  crearRejilla();
  raiz.classList.add('puntos-vivos'); // apaga el patrón fijo de CSS
  despertar();
}

iniciarPuntos();

// Entrada del botón principal de la portada: la luz lo recorre una vez.
function iniciarEntradaBoton() {
  const boton = document.querySelector('.portada .boton');
  if (!boton || movimientoReducido) return;
  const quitar = () => boton.classList.remove('boton--entrada');
  boton.addEventListener('animationend', (evento) => {
    if (evento.animationName === 'entrada-anillo') quitar();
  });
  setTimeout(() => boton.classList.add('boton--entrada'), 900);
  setTimeout(quitar, 5000); // por si el navegador no avisa del final
}

iniciarEntradaBoton();
// Titular de la portada: se escribe letra a letra una sola vez, al cargar.
// El texto completo está en el HTML desde el principio; aquí solo se ocultan
// las letras y se van mostrando, de modo que el titular ocupa siempre el mismo
// sitio y nada se mueve. Los lectores de pantalla leen la frase entera
// (aria-label). Al terminar se restaura el texto original.
function iniciarEscritura() {
  const titular = document.querySelector('#titulo-portada');
  if (!titular || movimientoReducido) return;

  const texto = titular.textContent.trim().replace(/\s+/g, ' ');
  const capa = document.createElement('span');
  capa.setAttribute('aria-hidden', 'true');
  const letras = [...texto].map((caracter) => {
    const letra = document.createElement('span');
    letra.className = 'letra';
    letra.textContent = caracter;
    capa.append(letra);
    return letra;
  });

  titular.setAttribute('aria-label', texto);
  titular.textContent = '';
  titular.append(capa);
  titular.classList.add('portada__titular--escribiendo');

  let indice = 0;

  function escribir() {
    if (indice > 0) letras[indice - 1].classList.remove('letra--cursor');
    const letra = letras[indice];
    letra.classList.add('letra--vista', 'letra--cursor');
    indice++;

    if (indice === letras.length) {
      setTimeout(terminar, 1800); // el cursor parpadea un momento y desaparece
      return;
    }
    // Pausa algo más larga tras una coma, como al escribir de verdad.
    setTimeout(escribir, letra.textContent === ',' ? 240 : 40);
  }

  function terminar() {
    titular.textContent = texto;
    titular.removeAttribute('aria-label');
    // La clase no se quita: si se quitara, volvería a dispararse la animación
    // de entrada de la portada y el titular parpadearía.
  }

  setTimeout(escribir, 350);
}

iniciarEscritura();
/* 4. REVELADO AL DESPLAZARSE ---------------------------------------------- */
// Los bloques aparecen cuando entran en pantalla (lo comprueba alDesplazar, en
// el apartado 6). Con movimiento reducido no se pone la clase "animar" y todo
// queda visible desde el principio.
const BLOQUES_REVELADOS = [
  '.seccion__cabeza', '.servicio', '.empresa__mision', '.empresa__lado', '.valor',
  '.escena__cabeza', '.editor-marco', '.aviso', '.dimension__cabeza', '.compromiso', '.ods__lado', '.ods__paneles',
  '.tabla tbody tr', '.contacto__info', '.formulario',
].join(',');

let bloquesPendientes = [];

// Muestra los bloques cuyo inicio ya ha entrado en la ventana. También los que
// quedan por encima, para que al saltar con un enlace no quede nada oculto.
function revelarVisibles() {
  if (bloquesPendientes.length === 0) return;
  const limite = window.innerHeight * 0.88;
  bloquesPendientes = bloquesPendientes.filter((bloque) => {
    if (bloque.getBoundingClientRect().top > limite) return true;
    bloque.classList.add('visto');
    return false;
  });
}

function iniciarRevelado() {
  if (movimientoReducido) return;

  bloquesPendientes = [...document.querySelectorAll(BLOQUES_REVELADOS)];
  for (const bloque of bloquesPendientes) bloque.classList.add('revelar');

  // Si el foco del teclado entra en un bloque aún oculto, se muestra al instante.
  document.addEventListener('focusin', (evento) => {
    const bloque = evento.target.closest('.revelar');
    if (bloque) bloque.classList.add('visto');
  });

  raiz.classList.add('animar');
}

iniciarRevelado();

/* 5. PESTAÑAS DE LOS ODS Y RECORRIDO FIJADO -------------------------------- */
const pestanas = [...document.querySelectorAll('.ods-ficha')];
const paneles = pestanas.map((p) => document.getElementById(p.getAttribute('aria-controls')));
const recorrido = document.querySelector('#ods-recorrido');
const escena = recorrido.querySelector('.ods');
const pista = document.querySelector('#ods-pista');
const pantallaGrande = window.matchMedia('(min-width: 64rem)');

let indiceOds = 0;
let fijado = false;     // true cuando el explorador se queda fijo y el scroll cambia de ODS
let topeEscena = 96;    // distancia a la que la escena se queda fija (top: 6rem en el CSS)

function seleccionarPestana(indice, moverFoco) {
  indiceOds = indice;
  pestanas.forEach((pestana, i) => {
    const elegida = i === indice;
    pestana.setAttribute('aria-selected', String(elegida));
    pestana.tabIndex = elegida ? 0 : -1;
    paneles[i].hidden = !elegida;
  });
  if (moverFoco) pestanas[indice].focus();

  const ultimo = indice === pestanas.length - 1;
  pista.textContent =
    `Objetivo ${indice + 1} de ${pestanas.length}. ` +
    (ultimo ? 'Sigue bajando para ver la tabla resumen.' : 'Sigue bajando para ver el siguiente.');
}

// Elegir una pestaña a mano. En el recorrido fijado, además, se mueve el scroll
// al tramo de ese ODS para que scroll y pestaña digan siempre lo mismo.
function irAPestana(indice, moverFoco) {
  seleccionarPestana(indice, moverFoco);
  if (!fijado) return;

  const viaje = recorrido.offsetHeight - escena.offsetHeight;
  const inicio = recorrido.getBoundingClientRect().top + window.scrollY - topeEscena;
  window.scrollTo({
    top: inicio + ((indice + 0.5) / pestanas.length) * viaje,
    behavior: 'instant',
  });
}

pestanas.forEach((pestana, indice) => {
  pestana.addEventListener('click', () => irAPestana(indice, false));

  // Patrón de pestañas accesible: flechas, Inicio y Fin cambian de pestaña.
  pestana.addEventListener('keydown', (evento) => {
    let destino = null;
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowRight') destino = indice + 1;
    if (evento.key === 'ArrowUp' || evento.key === 'ArrowLeft') destino = indice - 1;
    if (evento.key === 'Home') destino = 0;
    if (evento.key === 'End') destino = pestanas.length - 1;
    if (destino === null) return;

    evento.preventDefault();
    const total = pestanas.length;
    irAPestana((destino + total) % total, true);
  });
});

// Decide si se puede fijar el explorador: solo en pantalla grande, sin
// movimiento reducido y si el panel más alto cabe entero en la ventana.
function configurarRecorrido() {
  recorrido.classList.remove('ods-recorrido--fijado');
  recorrido.style.height = '';
  escena.style.minHeight = '';

  let altoMaximo = 0;
  paneles.forEach((panel) => {
    const oculto = panel.hidden;
    panel.hidden = false;
    altoMaximo = Math.max(altoMaximo, panel.offsetHeight);
    panel.hidden = oculto;
  });
  altoMaximo = Math.max(altoMaximo, escena.firstElementChild.offsetHeight);

  topeEscena = parseFloat(getComputedStyle(raiz).fontSize) * 6;
  const cabe = altoMaximo <= window.innerHeight - topeEscena - 16;
  fijado = pantallaGrande.matches && !movimientoReducido && cabe;
  pista.hidden = !fijado;

  if (fijado) {
    // Cada ODS ocupa media ventana de scroll.
    const viaje = pestanas.length * window.innerHeight * 0.5;
    escena.style.minHeight = altoMaximo + 'px';
    recorrido.style.height = altoMaximo + viaje + 'px';
    recorrido.classList.add('ods-recorrido--fijado');
  }
}

function actualizarRecorrido() {
  if (!fijado) return;
  const viaje = recorrido.offsetHeight - escena.offsetHeight;
  const avance = (topeEscena - recorrido.getBoundingClientRect().top) / viaje;
  const indice = Math.min(pestanas.length - 1, Math.max(0, Math.floor(avance * pestanas.length)));
  if (indice !== indiceOds) seleccionarPestana(indice, false);
}

// Reflejo del vidrio del selector: con ratón, la luz sigue al puntero. Al
// salir vuelve a su sitio (arriba, en el centro), que es como se ve en táctil.
function iniciarReflejoSelector() {
  const selector = document.querySelector('.ods__selector');
  const punteroFino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!selector || !punteroFino || movimientoReducido) return;

  selector.addEventListener('pointermove', (evento) => {
    const caja = selector.getBoundingClientRect();
    selector.style.setProperty('--px', evento.clientX - caja.left + 'px');
    selector.style.setProperty('--py', evento.clientY - caja.top + 'px');
  });
  selector.addEventListener('pointerleave', () => {
    selector.style.removeProperty('--px');
    selector.style.removeProperty('--py');
  });
}

iniciarReflejoSelector();

seleccionarPestana(0, false);
configurarRecorrido();

// Escena del editor: la secuencia se reproduce una sola vez, cuando la ventana
// entra en pantalla. Con movimiento reducido no se toca nada y el HTML se ve
// directamente en su estado final. alDesplazar (apartado 6) llama a
// comprobarEditor en cada scroll hasta que arranca.
const editor = document.querySelector('#editor');
let editorEnEspera = false;

function iniciarEditor() {
  if (!editor || movimientoReducido) return;
  editor.classList.add('editor--animado'); // vuelve al estado inicial
  editorEnEspera = true;
}

function comprobarEditor() {
  if (!editorEnEspera) return;
  if (editor.getBoundingClientRect().top > window.innerHeight * 0.6) return;
  editorEnEspera = false;

  const pruebas = editor.querySelectorAll('.prueba');
  const pasos = [
    [700, () => editor.classList.add('es-sugerencia')],
    [2300, () => editor.classList.add('es-tab')],
    [2700, () => editor.classList.add('es-aceptada')],
    [3600, () => pruebas[0].classList.add('es-hecha')],
    [4200, () => pruebas[1].classList.add('es-hecha')],
    [4800, () => pruebas[2].classList.add('es-hecha')],
    [5200, () => editor.classList.add('es-final')],
  ];
  for (const [espera, paso] of pasos) setTimeout(paso, espera);
}

iniciarEditor();
/* 6. SEGUIMIENTO DEL SCROLL ------------------------------------------------ */
// Enlace activo de la navegación principal.
const enlacesNav = [...nav.querySelectorAll('a[href^="#"]')];
const secciones = enlacesNav
  .map((enlace) => document.querySelector(enlace.getAttribute('href')))
  .filter(Boolean);

function marcarEnlaceActivo() {
  // La sección activa es la última cuyo inicio ya ha pasado bajo la cabecera.
  const limite = window.innerHeight * 0.35;
  let activa = null;
  for (const seccion of secciones) {
    if (seccion.getBoundingClientRect().top <= limite) activa = seccion;
  }
  for (const enlace of enlacesNav) {
    const esActivo = activa && enlace.getAttribute('href') === '#' + activa.id;
    if (esActivo) enlace.setAttribute('aria-current', 'true');
    else enlace.removeAttribute('aria-current');
  }
}

// Progreso de la política ASG: una marca por compromiso, agrupadas por capítulo.
const progreso = document.querySelector('#progreso');
const estadoProgreso = document.querySelector('#progreso-estado');
const compromisos = [...document.querySelectorAll('.compromiso')];
const marcas = [];
let indiceCompromiso = null;

for (const capitulo of progreso.querySelectorAll('.progreso__capitulo')) {
  const enlace = capitulo.querySelector('a');
  const dimension = document.querySelector(enlace.getAttribute('href'));
  const cuantos = dimension.querySelectorAll('.compromiso').length;
  capitulo.style.setProperty('--cuantos', cuantos);
  for (let i = 0; i < cuantos; i++) {
    const marca = document.createElement('span');
    capitulo.querySelector('.progreso__marcas').append(marca);
    marcas.push({ marca, enlace });
  }
}
progreso.hidden = false;

function actualizarProgreso() {
  // El compromiso actual es el último que ha cruzado el 60 % de la ventana.
  const limite = window.innerHeight * 0.6;
  let indice = -1;
  compromisos.forEach((compromiso, i) => {
    if (compromiso.getBoundingClientRect().top <= limite) indice = i;
  });
  if (indice === indiceCompromiso) return;
  indiceCompromiso = indice;

  marcas.forEach(({ marca, enlace }, i) => {
    marca.classList.toggle('hecha', i < indice);
    marca.classList.toggle('actual', i === indice);
    compromisos[i].classList.toggle('actual', i === indice);
    enlace.removeAttribute('aria-current');
  });

  if (indice === -1) {
    estadoProgreso.textContent = `Tres capítulos, ${compromisos.length} compromisos`;
    return;
  }
  marcas[indice].enlace.setAttribute('aria-current', 'true');
  const codigo = compromisos[indice].querySelector('.codigo').textContent;
  estadoProgreso.textContent = `${codigo}, compromiso ${indice + 1} de ${compromisos.length}`;
}

// Un solo cálculo por fotograma, aunque lleguen muchos eventos de scroll.
let scrollPendiente = false;

function alDesplazar() {
  scrollPendiente = false;
  revelarVisibles();
  comprobarEditor();
  marcarEnlaceActivo();
  actualizarProgreso();
  actualizarRecorrido();
}

function pedirActualizacion() {
  if (scrollPendiente) return;
  scrollPendiente = true;
  requestAnimationFrame(alDesplazar);
}

window.addEventListener('scroll', pedirActualizacion, { passive: true });
window.addEventListener('resize', () => {
  configurarRecorrido();
  pedirActualizacion();
});
alDesplazar();

/* 7. FORMULARIO DE CONTACTO ------------------------------------------------ */
// No hay servidor, así que no se envía nada: el formulario redacta el mensaje
// y la persona lo copia o lo abre en su programa de correo.
const formulario = document.querySelector('#formulario');
const resultado = document.querySelector('#resultado');
const textoResultado = document.querySelector('#resultado-texto');
const estado = document.querySelector('#estado');
const enlaceCorreo = document.querySelector('#abrir-correo');
const correoEmpresa = formulario.dataset.correo.trim();

function validarCampo(campo) {
  const valido = campo.value.trim() !== '';
  campo.setAttribute('aria-invalid', String(!valido));
  document.getElementById('error-' + campo.id).hidden = valido;
  return valido;
}

formulario.addEventListener('submit', (evento) => {
  evento.preventDefault();

  const nombre = formulario.elements.nombre;
  const mensaje = formulario.elements.mensaje;
  const servicio = formulario.elements.servicio.value;

  const nombreValido = validarCampo(nombre);
  const mensajeValido = validarCampo(mensaje);
  if (!nombreValido) return nombre.focus();
  if (!mensajeValido) return mensaje.focus();

  const texto =
    `Hola, soy ${nombre.value.trim()}.\n\n` +
    `Necesito: ${servicio}\n\n` +
    `${mensaje.value.trim()}`;

  textoResultado.textContent = texto;
  estado.textContent = '';
  resultado.hidden = false;

  if (correoEmpresa) {
    enlaceCorreo.href =
      `mailto:${correoEmpresa}` +
      `?subject=${encodeURIComponent('Consulta: ' + servicio)}` +
      `&body=${encodeURIComponent(texto)}`;
    enlaceCorreo.hidden = false;
  }

  document.querySelector('#resultado-titulo').focus();
});

document.querySelector('#copiar').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(textoResultado.textContent);
    estado.textContent = 'Mensaje copiado.';
  } catch {
    estado.textContent =
      'No se ha podido copiar automáticamente. Selecciona el texto y cópialo a mano.';
  }
});
