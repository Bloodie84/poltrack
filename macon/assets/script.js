/* =========================================================
   Maçonnerie — scripts du site
   ========================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     RÉCEPTION DU FORMULAIRE
     Laisser vide ("") pour envoyer via le logiciel de messagerie
     du visiteur (mailto). Pour recevoir les demandes directement
     par e-mail sans serveur, créer un formulaire sur Formspree
     (https://formspree.io) et coller ici l'URL fournie, du type :
     'https://formspree.io/f/xxxxxxxx'
     --------------------------------------------------------- */
  var FORM_ENDPOINT = '';
  var CONTACT_EMAIL = 'contact@exemple-maconnerie.fr'; // À REMPLACER

  /* ---------- Menu mobile ---------- */
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');

  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      burger.setAttribute('aria-label', open ? 'Ouvrir le menu' : 'Fermer le menu');
      nav.dataset.open = String(!open);
    });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        burger.setAttribute('aria-expanded', 'false');
        nav.dataset.open = 'false';
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.dataset.open === 'true') {
        burger.setAttribute('aria-expanded', 'false');
        nav.dataset.open = 'false';
        burger.focus();
      }
    });
  }

  /* ---------- Lien de navigation actif au défilement ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.toggleAttribute('aria-current', a.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------- Apparition progressive des blocs ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- Année du copyright ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Formulaire de devis ---------- */
  var form = document.getElementById('devis-form');
  var status = document.getElementById('form-status');
  if (!form) return;

  function say(state, text) {
    if (!status) return;
    status.dataset.state = state;
    status.textContent = text;
    status.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Piège à robots : si le champ caché est rempli, on ignore silencieusement.
    if (form.elements._gotcha && form.elements._gotcha.value) return;

    if (!form.checkValidity()) {
      form.reportValidity();
      say('err', 'Merci de compléter les champs obligatoires.');
      return;
    }

    var data = new FormData(form);
    var submitBtn = form.querySelector('button[type="submit"]');
    var initialLabel = submitBtn ? submitBtn.textContent : '';

    // Sans endpoint configuré : ouverture du logiciel de messagerie.
    if (!FORM_ENDPOINT) {
      var lignes = [
        'Nom : ' + (data.get('nom') || ''),
        'Téléphone : ' + (data.get('telephone') || ''),
        'E-mail : ' + (data.get('email') || '—'),
        'Commune : ' + (data.get('commune') || ''),
        'Prestation : ' + (data.get('prestation') || ''),
        '',
        'Projet :',
        data.get('message') || ''
      ].join('\n');

      window.location.href = 'mailto:' + CONTACT_EMAIL +
        '?subject=' + encodeURIComponent('Demande de devis — ' + (data.get('prestation') || 'maçonnerie')) +
        '&body=' + encodeURIComponent(lignes);

      say('ok', 'Votre logiciel de messagerie va s’ouvrir avec la demande pré-remplie. Il ne reste qu’à l’envoyer.');
      return;
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Envoi en cours…'; }

    fetch(FORM_ENDPOINT, {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        form.reset();
        say('ok', 'Merci, votre demande est bien partie. Nous vous rappelons sous 24 h ouvrées.');
      })
      .catch(function () {
        say('err', 'L’envoi a échoué. Vous pouvez nous joindre directement par téléphone ou à ' + CONTACT_EMAIL + '.');
      })
      .finally(function () {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = initialLabel; }
      });
  });
})();
