# GTL Inspector — PWA de Inspección E&I

Sistema mobile-first para inspectores de **Electricidad, Instrumentación y Control** que trabajan en obras de **YPF Upstream** en Vaca Muerta.

- **Empresa:** GRUPO TERGO LAF (GTL)
- **Cliente:** YPF Upstream Neuquén
- **Stack:** PWA HTML/CSS/JS vanilla + Google Apps Script + Google Sheets
- **Offline-first:** IndexedDB para cola de envíos + Background Sync API
- **Multi-obra:** soporta múltiples proyectos en simultáneo (Loop FO, PC1, Casquete, etc.)

---

## 1. Estructura del proyecto

```
gtl-inspector/
├── index.html              # Shell + navegación
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (offline + Background Sync)
├── README.md               # Este archivo
├── css/
│   ├── tokens.css          # Variables YPF
│   ├── base.css            # Reset + tipografía
│   ├── components.css      # Botones, cards, inputs, toasts, modales
│   └── views.css           # Estilos por pantalla
├── js/
│   ├── app.js              # Bootstrap + router + UI helpers
│   ├── store.js            # localStorage + IndexedDB
│   ├── sync.js             # Cola y sincronización con Apps Script
│   ├── views/
│   │   ├── setup.js        # Wizard onboarding + alta de obra
│   │   ├── form.js         # Formulario diario completo
│   │   ├── dashboard.js    # KPIs + gráficos
│   │   └── settings.js     # Settings + Histórico + Detalle
│   └── lib/
│       └── chart-helpers.js # Wrappers de Chart.js
├── apps-script/
│   └── Code.gs             # Backend completo para pegar en Google
└── icons/
    ├── icon.svg            # Logo fuente
    └── generate.html       # Generador de PNGs (abrir local)
```

---

## 2. Setup paso a paso

### Paso 1 — Crear el Google Sheet

1. Abrí <https://sheets.new> (Google Sheets en blanco).
2. Renombrá el documento a **GTL Inspector — Datos**.
3. Dejá la pestaña por defecto vacía (la app va a crear el resto).

### Paso 2 — Pegar el backend Apps Script

1. Dentro del Sheet, andá a **Extensiones → Apps Script**.
2. Borrá el contenido de `Code.gs`.
3. Copiá el contenido completo del archivo **`apps-script/Code.gs`** de este repo y pegalo.
4. Guardá con **Ctrl+S** y poné nombre al proyecto: `GTL Inspector Backend`.
5. En el panel izquierdo, seleccioná la función **`setupSheets`** y apretá **▶ Ejecutar**.
6. La primera vez te va a pedir permisos:
   - "Revisar permisos" → tu cuenta Google
   - "Avanzado → Ir a GTL Inspector Backend (no seguro)" → **Permitir**
7. Cuando termine, vas a ver en el Sheet las pestañas: **Configuración**, **Obras**, **Inspectores**, **Logs**.

### Paso 3 — Deployar como Web App

1. En el editor de Apps Script: **Implementar → Nueva implementación**.
2. Tipo de implementación: **Aplicación web** (icono ⚙ → Aplicación web).
3. Configuración:
   - **Descripción:** `GTL Inspector v1`
   - **Ejecutar como:** Yo (tu cuenta)
   - **Quién tiene acceso:** **Cualquiera** (necesario para que la PWA pueda postear)
4. Apretá **Implementar**.
5. Copiá la **URL del Web App** (formato: `https://script.google.com/macros/s/AKfy.../exec`).
6. Guardá esa URL — la vas a pegar en el wizard de la app.

> **Cada vez que toques `Code.gs` y querés que la app vea los cambios:**
> Implementar → Administrar implementaciones → ✏ Editar → Versión: **Nueva versión** → Implementar.
> La URL no cambia.

### Paso 4 — Generar iconos PWA (opcional pero recomendado)

La app ya viene con un SVG funcional como icono. Para tener PNGs nítidos en el splash de Android/iOS:

1. Servir la carpeta del proyecto con cualquier server local (ver paso 5).
2. Abrir `https://localhost:.../icons/generate.html`.
3. Apretar **Descargar todos**.
4. Mover los PNGs descargados a `/icons/`.

### Paso 5 — Servir la PWA localmente para probar

Las PWAs requieren HTTPS o localhost. Cualquier server estático sirve:

```bash
# Opción A — Python 3
python -m http.server 8080

# Opción B — Node con npx
npx serve -p 8080

# Opción C — VSCode extension "Live Server"
```

Abrí `http://localhost:8080` en Chrome (o Edge). Para probar el Service Worker, mejor usar **Chrome DevTools → Application**.

### Paso 6 — Onboarding

1. Al abrir por primera vez aparece el wizard de 4 pasos.
2. Cargá tus datos (paso 1).
3. Pegá la URL del Apps Script (paso 2) y apretá **Probar conexión** — tiene que decir ✓ Conectado.
4. Cargá tu primera obra (paso 3): nombre, PK, locaciones, especialidades.
5. Listo (paso 4) — apretá **COMENZAR**.

---

## 3. Deploy en producción

La PWA es 100% estática. Cualquier hosting estático funciona:

### Opción A — GitHub Pages

```bash
# En tu repo de GitHub
git init
git add .
git commit -m "GTL Inspector v1"
git branch -M main
git remote add origin git@github.com:TU_USUARIO/gtl-inspector.git
git push -u origin main
```

En GitHub: **Settings → Pages → Source: main / root**. La URL queda en `https://TU_USUARIO.github.io/gtl-inspector/`.

> Ojo: GitHub Pages sirve desde subdirectorio. Verificá que `manifest.json` y `sw.js` resuelvan rutas relativas (ya están así en este repo: `./index.html` y `manifest.json`).

### Opción B — Netlify / Vercel

```bash
# Netlify CLI
npm i -g netlify-cli
netlify deploy --prod --dir=.

# Vercel CLI
npm i -g vercel
vercel --prod
```

Ambos detectan que es estático y le dan HTTPS automático.

### Opción C — Firebase Hosting

```bash
npm i -g firebase-tools
firebase init hosting   # public dir: . , single-page: yes, no rewrites
firebase deploy
```

---

## 4. Instalar la PWA en el celular

### Android (Chrome / Edge)

1. Abrí la URL de la app.
2. En el menú ⋮ → **Instalar aplicación** (o aparece automáticamente la barra "Agregar a la pantalla de inicio").
3. La app queda como icono en el cajón. Funciona offline.

### iPhone (Safari)

1. Abrí la URL en Safari (no funciona en Chrome de iOS, es limitación de iOS).
2. Compartir ↗ → **Agregar a pantalla de inicio**.
3. Se instala como app.

> En iOS, las notificaciones push y Background Sync están limitadas. La cola offline igual funciona y se sincroniza al volver a abrir la app con señal.

---

## 5. Uso en obra

### Cargar parte diario

1. Tab **Cargar** (➕).
2. Seleccionar fecha + turno.
3. Llenar las 5 secciones: Condiciones, HSE, Avances por especialidad, Hand Over, Cierre.
4. Cualquier momento → **💾 Guardar borrador** (recuperable la próxima vez).
5. Cuando esté listo → **ENVIAR PARTE**.
   - Si hay señal → se envía al Sheet en el momento.
   - Si no → se encola en IndexedDB y se sincroniza solo cuando vuelve la conexión.

### Dashboard

Tab **Dashboard** (📊). Auto-refresh cada 5 min. Muestra:
- Avance general (%) por PK actual vs total.
- KPIs por especialidad.
- Pipeline visual del ducto.
- Curvas de avance acumulado por especialidad.
- Tabla PAT por locación con semáforo (≤ 1.5Ω verde, ≤ 2Ω ámbar, > 2Ω rojo).
- Pendientes urgentes y NCs abiertas.
- Botones de imprimir (PDF) y CSV.

### Histórico

Tab **Más → Histórico**. Lista de partes anteriores con filtros, click para ver detalle, exportar CSV.

### Configuración

Tab **Más → Configuración**:
- Editar inspector / cambiar URL del backend.
- Agregar / editar / eliminar obras (multi-obra).
- Modo oscuro, notificaciones.
- Backup JSON (export / import).
- Reset total de datos locales.

---

## 6. Validaciones automáticas (normativa YPF)

| Item | Límite | Acción |
|---|---|---|
| PAT (mallas) | **≤ 2Ω** | > 2Ω → fila roja + alerta dashboard |
| PAT (warning) | ≤ 1.5Ω | 1.5–2Ω → fila ámbar |
| Test martillo Cupro | PASS | FAIL → resaltado y alerta |
| Resistencia Cupro | < 1 mΩ | reporte en CSV |
| Atenuación FO @1310/1550 | ≤ 0.40 dB/km | (cargar en observación OTDR) |
| Atenuación por empalme FO | ≤ 0.10 dB | (cargar en observación) |
| Fecha del parte | ≤ hoy | bloqueado en input |
| FO acumulado | ≥ FO hoy | validado al enviar |
| PK fin | > PK inicio | bloqueado al guardar obra |

---

## 7. Troubleshooting

### "Error de conexión al probar el webhook"
- Verificá que en **Implementar → Quién tiene acceso** esté en **"Cualquiera"** (no "Cualquiera con la cuenta de Google").
- Verificá que la URL termine en `/exec` (no `/dev`).
- Si hiciste cambios en `Code.gs`, volvé a deployar como **Nueva versión**.

### "Los partes no llegan al Sheet"
- Andá a **Más → Sincronizar ahora**.
- Mirá la pestaña **Logs** del Sheet.
- En la app, en el TopBar el badge muestra cantidad de pendientes.

### "Cargué cambios y no se actualizan en el celular"
- Service Worker cachea agresivamente. En Chrome DevTools → Application → **Update on reload**.
- O entrá a **Más → Configuración → Limpiar caché PWA** y refrescá.

### "Quiero borrar y arrancar de cero"
- **Más → Configuración → Borrar todos los datos** (no toca el Sheet, sólo el dispositivo).

### "Cómo cambiar de una obra a otra"
- En el formulario aparece el selector arriba.
- En **Configuración → Obras** podés activar otra desde la lista.

### "Tengo internet intermitente, ¿pierdo el parte?"
- No. Mientras la pestaña esté abierta, queda en IndexedDB.
- Background Sync intenta enviarlo cuando vuelve la red.
- Si cerraste la app, al abrirla de nuevo se reintenta automáticamente.

---

## 8. Estructura de datos en Google Sheets

- **Configuración:** versión, empresa, cliente.
- **Obras:** una fila por obra (id, nombre, PK, locaciones JSON, especialidades JSON).
- **Inspectores:** registro de cada inspector que cargó parte.
- **Logs:** auditoría de operaciones del backend.
- **Parte_<obraId>:** una pestaña por obra con todos los partes (columnas dinámicas según las especialidades activas).

Las celdas con problemas se resaltan automáticamente:
- 🟥 PAT > 2Ω
- 🟥 Cupro con martillo FAIL
- 🟧 HSE con novedad

---

## 9. Roadmap (post v1)

- [ ] Push notifications cuando llega un parte (al supervisor)
- [ ] Modo "supervisor" con multi-obra simultánea
- [ ] Firma digital con canvas (en lugar de nombre tipeado)
- [ ] Sincronización bidireccional (descargar partes históricos al device)
- [ ] OCR de TAGs de instrumentos desde foto
- [ ] Export PDF nativo (no `window.print`)
- [ ] Mapas con Leaflet mostrando PK vs ubicación GPS

---

## 10. Créditos

Sistema desarrollado para **GTL — GRUPO TERGO LAF**.

- **Director:** Luis Francica
- **Inspector E&I:** Cristian Rodriguez (UTN Tucumán)
- **Cliente:** YPF Upstream Neuquén — Cuenca Neuquina, Vaca Muerta

Hecho con ☕ y mucho viento patagónico.
