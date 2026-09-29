/* SBM Infra — alternate homepage No. 2 ("Editorial Folio") interactions.
   Self-contained: used only by index-alt2.html. */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  /* Header hairline + shadow once scrolled past the hero's first lines */
  var header = document.getElementById('folio-header');
  var onScroll = function () {
    header.classList.toggle('scrolled', window.scrollY > 24);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Mobile nav */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('folio-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
  }

  /* Scroll-reveal */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* Portfolio hover preview (desktop): swap the sticky plate image */
  var previewImg = document.getElementById('preview-img');
  var previewCap = document.getElementById('preview-cap');
  if (previewImg && previewCap) {
    var swapTimer = null;
    document.querySelectorAll('.folio-row[data-preview]').forEach(function (row) {
      var show = function () {
        var src = row.getAttribute('data-preview');
        if (previewImg.getAttribute('src') === src) return;
        previewImg.classList.add('swapping');
        clearTimeout(swapTimer);
        swapTimer = setTimeout(function () {
          previewImg.setAttribute('src', src);
          previewCap.innerHTML = row.getAttribute('data-caption') || '';
          previewImg.classList.remove('swapping');
        }, 180);
      };
      row.addEventListener('mouseenter', show);
      row.addEventListener('focus', show);
    });
  }
})();
