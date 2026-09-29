/* SBM alternate homepage — hero slideshow, header state, nav, reveals */
(function () {
  'use strict';

  // Arms the scroll-reveal CSS (see .js-armed in alt.css) — only once this
  // line actually runs do .reveal elements switch from "visible" to
  // "hidden until scrolled into view", so a blocked/failed script load
  // never leaves content permanently invisible.
  document.documentElement.classList.add('js-armed');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Header: solid after scrolling past the fold ---------- */
  var header = document.querySelector('.alt-header');
  function onScroll() {
    header.classList.toggle('scrolled', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile nav ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('alt-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
  }

  /* ---------- Scroll reveals (with per-sibling stagger) ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  revealEls.forEach(function (el) {
    var parent = el.parentElement;
    if (parent && parent.classList.contains('stagger')) {
      var siblings = Array.prototype.filter.call(parent.children, function (c) {
        return c.classList.contains('reveal');
      });
      var idx = siblings.indexOf(el);
      el.style.transitionDelay = Math.min(idx * 0.07, 0.42) + 's';
    }
  });
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Stat count-up (opt-in via data-count) ---------- */
  var counters = document.querySelectorAll('.stat-num[data-count]');
  function runCounter(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    var suffix = el.getAttribute('data-suffix') || '';
    var dur = 1400;
    var t0 = null;
    function frame(t) {
      if (!t0) { t0 = t; }
      var p = Math.min((t - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.childNodes[0].nodeValue = String(Math.round(target * eased));
      if (p < 1) { window.requestAnimationFrame(frame); }
    }
    // suffix rendered as <sup> so it inherits the accent colour
    el.innerHTML = '0' + (suffix ? '<sup>' + suffix + '</sup>' : '');
    window.requestAnimationFrame(frame);
  }
  if (counters.length) {
    if (!reduceMotion && 'IntersectionObserver' in window) {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            runCounter(e.target);
            cio.unobserve(e.target);
          }
        });
      }, { threshold: 0.4 });
      counters.forEach(function (el) { cio.observe(el); });
    }
    // reduced motion / no IO: leave the server-rendered final values alone
  }

  /* ---------- Lightbox for plans & brochure documents ---------- */
  var lbTriggers = Array.prototype.slice.call(document.querySelectorAll('[data-lightbox]'));
  if (lbTriggers.length) {
    var lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Image viewer');
    lb.innerHTML =
      '<button class="lb-btn lb-close" aria-label="Close viewer">&#10005;</button>' +
      '<button class="lb-btn lb-prev" aria-label="Previous item">&#8592;</button>' +
      '<button class="lb-btn lb-next" aria-label="Next item">&#8594;</button>' +
      '<figure><span class="lb-media"></span><figcaption><span class="lb-cap"></span><span class="lb-idx"></span></figcaption></figure>';
    document.body.appendChild(lb);

    var lbMedia = lb.querySelector('.lb-media');
    var lbCap = lb.querySelector('.lb-cap');
    var lbIdx = lb.querySelector('.lb-idx');
    var lbClose = lb.querySelector('.lb-close');
    var lbPrev = lb.querySelector('.lb-prev');
    var lbNext = lb.querySelector('.lb-next');
    var activeIdx = 0;
    var lastFocus = null;

    function lbShow(i) {
      activeIdx = (i + lbTriggers.length) % lbTriggers.length;
      var t = lbTriggers[activeIdx];
      var caption = t.getAttribute('data-caption') || '';
      var yt = t.getAttribute('data-youtube');
      if (yt) {
        lbMedia.innerHTML =
          '<span class="lb-video-frame"><iframe src="https://www.youtube-nocookie.com/embed/' + yt +
          '?autoplay=1&rel=0" title="' + caption.replace(/"/g, '&quot;') +
          '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></span>';
      } else {
        var img = document.createElement('img');
        img.src = t.getAttribute('href') || t.getAttribute('data-full');
        img.alt = caption;
        lbMedia.innerHTML = '';
        lbMedia.appendChild(img);
      }
      lbCap.textContent = caption;
      lbIdx.textContent = (activeIdx + 1) + ' / ' + lbTriggers.length;
      var solo = lbTriggers.length < 2;
      lbPrev.style.display = solo ? 'none' : '';
      lbNext.style.display = solo ? 'none' : '';
    }
    function lbOpen(i) {
      lastFocus = document.activeElement;
      lbShow(i);
      lb.classList.add('open');
      document.body.style.overflow = 'hidden';
      lbClose.focus();
    }
    function lbHide() {
      lb.classList.remove('open');
      lbMedia.innerHTML = ''; // clears the <img> or stops the YouTube iframe
      document.body.style.overflow = '';
      if (lastFocus) { lastFocus.focus(); }
    }

    lbTriggers.forEach(function (t, i) {
      t.addEventListener('click', function (ev) {
        ev.preventDefault();
        lbOpen(i);
      });
    });
    lbClose.addEventListener('click', lbHide);
    lbPrev.addEventListener('click', function () { lbShow(activeIdx - 1); });
    lbNext.addEventListener('click', function () { lbShow(activeIdx + 1); });
    lb.addEventListener('click', function (ev) {
      if (ev.target === lb) { lbHide(); }
    });
    document.addEventListener('keydown', function (ev) {
      if (!lb.classList.contains('open')) { return; }
      if (ev.key === 'Escape') { lbHide(); }
      if (ev.key === 'ArrowLeft') { lbShow(activeIdx - 1); }
      if (ev.key === 'ArrowRight') { lbShow(activeIdx + 1); }
    });
  }

  /* ---------- Hero background video (muted YouTube loop) ----------
     Activated only on capable desktops; the ghosted plan image stays
     as the poster for mobile, reduced-motion, and load failures.
     data-start / data-end trim playback to the wanted segment. */
  var heroGhost = document.querySelector('[data-hero-video]');
  if (heroGhost && !reduceMotion && window.matchMedia('(min-width: 720px)').matches) {
    var slot = heroGhost.querySelector('.hero-video-slot');
    var videoId = heroGhost.getAttribute('data-hero-video');
    var segStart = parseInt(heroGhost.getAttribute('data-start') || '0', 10);
    var segEnd = parseInt(heroGhost.getAttribute('data-end') || '0', 10) || null;
    var player = null;

    function sizeHeroVideo() {
      if (!player || !player.getIframe) { return; }
      var frame = player.getIframe();
      if (!frame) { return; }
      var w = heroGhost.clientWidth;
      var h = heroGhost.clientHeight;
      // oversize to cover the hero while keeping the 16:9 frame
      var iw, ih;
      if (w / h > 16 / 9) { iw = w; ih = w * 9 / 16; } else { ih = h; iw = h * 16 / 9; }
      frame.style.width = Math.ceil(iw) + 'px';
      frame.style.height = Math.ceil(ih) + 'px';
    }

    function initHeroPlayer() {
      var mount = document.createElement('div');
      slot.appendChild(mount);
      var vars = {
        autoplay: 1,
        mute: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        playsinline: 1,
        rel: 0,
        start: segStart
      };
      if (segEnd) { vars.end = segEnd; }
      // the API's postMessage handshake needs the page origin on http(s);
      // omit it on file:// where there is no usable origin
      if (/^https?:$/.test(window.location.protocol)) {
        vars.origin = window.location.origin;
      }
      player = new window.YT.Player(mount, {
        videoId: videoId,
        playerVars: vars,
        events: {
          onReady: function (e) {
            e.target.mute();
            sizeHeroVideo();
            e.target.playVideo();
          },
          onStateChange: function (e) {
            if (e.data === window.YT.PlayerState.PLAYING) {
              heroGhost.classList.add('video-live');
            }
            if (e.data === window.YT.PlayerState.ENDED) {
              // loop the trimmed segment, not the whole video
              e.target.seekTo(segStart, true);
              e.target.playVideo();
            }
          },
          onError: function () { /* embed blocked/unavailable — poster remains */ }
        }
      });
      window.addEventListener('resize', sizeHeroVideo);
    }

    var prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (prevReady) { prevReady(); }
      try { initHeroPlayer(); } catch (err) { /* poster image remains */ }
    };
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  }

  /* ---------- Enquiry form -> Google Sheet (via Apps Script Web App) ----------
     Falls back to the form's mailto action untouched if no endpoint is configured. */
  var enquiryForm = document.getElementById('enquiry-form');
  var sheetEndpoint = window.SBM_SHEET_ENDPOINT || '';
  if (enquiryForm && sheetEndpoint && sheetEndpoint.indexOf('PASTE_') !== 0) {
    enquiryForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var submitBtn = enquiryForm.querySelector('.btn-submit');
      var note = enquiryForm.querySelector('.form-note');
      var formData = new FormData(enquiryForm);

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      // Apps Script Web Apps don't return CORS headers, so the response is
      // opaque under no-cors — a resolved fetch just means the request landed.
      fetch(sheetEndpoint, { method: 'POST', mode: 'no-cors', body: formData })
        .then(function () {
          enquiryForm.reset();
          submitBtn.textContent = 'Request Sent';
          if (note) { note.textContent = 'Thank you — we’ve received your enquiry and will be in touch shortly.'; }
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Request';
          if (note) { note.textContent = 'Something went wrong sending that. Please email us directly at info@sbminfraprojects.in.'; }
        });
    });
  }
})();
