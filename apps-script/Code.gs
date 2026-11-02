/**
 * FLIP — lector de Gmail (SPEC 3.1). Se pega en script.google.com con la cuenta
 * que recibe los correos del BCP y de Yape.
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   INGEST_URL     https://<tu-app>.vercel.app/api/ingest
 *   INGEST_SECRET  el mismo valor que INGEST_SECRET en Vercel
 *
 * Funciones para ejecutar a mano (menú "Ejecutar"):
 *   probarConexion()  verifica URL y secreto sin enviar correos
 *   backfill()        carga el historial de los últimos 90 días (repetir si se corta)
 *   setup()           crea la revisión automática cada 5 minutos
 */

const SENDERS = ['notificaciones@notificacionesbcp.com.pe', 'notificaciones@yape.pe'];
const LABEL_NAME = 'finanzas/procesado';
const LABEL_SEARCH = 'finanzas-procesado'; // en las búsquedas de Gmail, "/" se escribe "-"
const BATCH_SIZE = 20; // correos por petición
const MAX_RUNTIME_MS = 5 * 60 * 1000; // Apps Script corta a los 6 minutos

/** Se ejecuta cada 5 minutos: correos de los últimos 3 días aún no procesados. */
function procesarNuevos() {
  procesar_(3);
}

/** Primera carga: historial de los últimos `dias` días (por defecto 90). */
function backfill(dias) {
  const n = procesar_(typeof dias === 'number' ? dias : 90);
  Logger.log('Backfill: ' + n.enviados + ' correos enviados en ' + n.hilos + ' conversaciones.' +
    (n.cortado ? ' Se cortó por tiempo: ejecuta backfill() otra vez para seguir.' : ' Terminado.'));
}

/** Crea (una sola vez) el disparador cada 5 minutos y la etiqueta. */
function setup() {
  label_();
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'procesarNuevos'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('procesarNuevos').timeBased().everyMinutes(5).create();
  Logger.log('Listo: FLIP revisará tus correos cada 5 minutos.');
}

/** Envía una petición vacía firmada: confirma que URL y secreto están bien. */
function probarConexion() {
  const res = enviar_([]);
  Logger.log(res.ok ? 'Conexión OK con FLIP.' : 'Falló (' + res.code + '): ' + res.text);
}

// ───────────────────────── internos ─────────────────────────

function procesar_(dias) {
  const inicio = Date.now();
  const label = label_();
  const query = '(' + SENDERS.map(function (s) { return 'from:' + s; }).join(' OR ') + ')' +
    ' newer_than:' + dias + 'd -label:' + LABEL_SEARCH;
  const vistos = {}; // por si Gmail tarda en reflejar la etiqueta recién puesta
  let enviados = 0;
  let hilos = 0;
  let cortado = false;

  while (true) {
    const threads = GmailApp.search(query, 0, 50).filter(function (t) { return !vistos[t.getId()]; });
    if (threads.length === 0) break;

    for (let i = 0; i < threads.length; i++) {
      if (Date.now() - inicio > MAX_RUNTIME_MS) { cortado = true; break; }
      const thread = threads[i];
      vistos[thread.getId()] = true;
      // Gmail agrupa correos con el mismo asunto: se manda CADA mensaje del hilo.
      // Los ya enviados se descartan en FLIP por gmail_message_id (idempotente).
      const mensajes = thread.getMessages()
        .filter(function (m) { return esRemitente_(m.getFrom()); })
        .map(aPayload_);

      let ok = true;
      for (let j = 0; j < mensajes.length; j += BATCH_SIZE) {
        const res = enviar_(mensajes.slice(j, j + BATCH_SIZE));
        if (!res.ok) {
          ok = false;
          Logger.log('Error ' + res.code + ' en "' + thread.getFirstMessageSubject() + '": ' + res.text);
          break;
        }
      }
      if (!ok) return { enviados: enviados, hilos: hilos, cortado: true }; // se reintenta en la próxima vuelta
      thread.addLabel(label);
      enviados += mensajes.length;
      hilos++;
    }
    if (cortado) break;
  }
  return { enviados: enviados, hilos: hilos, cortado: cortado };
}

function aPayload_(m) {
  return {
    gmail_message_id: m.getId(),
    from: m.getFrom(),
    subject: m.getSubject(),
    date: m.getDate().toISOString(),
    plain_body: m.getPlainBody(),
  };
}

function enviar_(mensajes) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('INGEST_URL');
  const secret = props.getProperty('INGEST_SECRET');
  if (!url || !secret) throw new Error('Faltan las propiedades INGEST_URL o INGEST_SECRET.');

  const body = JSON.stringify({ sent_at: new Date().toISOString(), messages: mensajes });
  const firma = Utilities.computeHmacSha256Signature(body, secret, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
    .join('');
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    payload: body,
    headers: { 'X-Ingest-Signature': firma },
    muteHttpExceptions: true,
    followRedirects: false,
  });
  const code = res.getResponseCode();
  return { ok: code === 200, code: code, text: res.getContentText().slice(0, 300) };
}

function esRemitente_(from) {
  const f = String(from).toLowerCase();
  return SENDERS.some(function (s) { return f.indexOf(s) !== -1; });
}

function label_() {
  return GmailApp.getUserLabelByName(LABEL_NAME) || GmailApp.createLabel(LABEL_NAME);
}
