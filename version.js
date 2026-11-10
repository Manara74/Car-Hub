/* Numero di versione di Car Hub (vale per tutta l'app, Pompa Giusta compresa).
   Si aggiorna a ogni pubblicazione. */
window.APP_VERSION = { v: '1.3', date: '2026-11-09' }; // la data non viene mostrata

(function () {
  function etichetta(v) { return 'Versione ' + v; }
  window.appVersionLabel = function () { return etichetta(window.APP_VERSION.v); };

  // Controlla se online c'è una versione più nuova; se sì, scarica i file aggiornati e ricarica.
  // base = '' (dal menu di Car Hub, alla radice) oppure '../' (da Pompa Giusta, in pompa/)
  window.appCheckUpdate = function (base, out, btn) {
    var FILES = ['', 'pompa/', 'app.js', 'lib.js', 'style.css', 'version.js', 'garage/garage.js', 'garage/garage.css'];
    function say(t) { if (out) out.textContent = t; }
    if (btn) btn.disabled = true;
    say('Controllo in corso…');
    fetch(base + 'version.js?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (txt) {
        var m = txt.match(/v:\s*'([^']+)'\s*,\s*date:\s*'([^']+)'/);
        if (!m) throw new Error('formato');
        if (m[1] === window.APP_VERSION.v) { say('Sei aggiornato: hai l’ultima versione (' + m[1] + ').'); if (btn) btn.disabled = false; return; }
        say('Nuova versione ' + m[1] + ' trovata. Aggiorno…');
        return Promise.all(FILES.map(function (f) { return fetch(base + f, { cache: 'reload' }).catch(function () {}); }))
          .then(function () { location.reload(); });
      })
      .catch(function () { say('Non riesco a controllare: verifica la connessione e riprova.'); if (btn) btn.disabled = false; });
  };
})();
