(function () {
  'use strict';

  var listEl = document.getElementById('projects-list');
  var logoutBtn = document.getElementById('logout-btn');

  // Must stay in step with VIDEO_CATEGORY_ORDER in api/_lib/render-project.js,
  // which is what the server validates against.
  var VIDEO_CATEGORIES = [
    'Before Development',
    'Development',
    'After Development',
    'Launch Day',
    'Drone Footage',
  ];

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  var currentProjects = [];

  function renderProjects(projects) {
    // A full rebuild replaces every card's DOM, so whichever project(s)
    // were expanded would otherwise silently collapse on every save -
    // capture that state first and restore it after.
    var expandedSlugs = Array.prototype.slice
      .call(listEl.querySelectorAll('.admin-project-body:not([hidden])'))
      .map(function (el) { return el.closest('.admin-project').getAttribute('data-project'); });

    listEl.innerHTML = projects.map(renderProject).join('');

    projects.forEach(function (p) {
      var card = document.querySelector('[data-project="' + p.slug + '"]');
      if (!card) return;

      if (expandedSlugs.indexOf(p.slug) !== -1) {
        var body = card.querySelector('.admin-project-body');
        var toggle = card.querySelector('.admin-project-toggle');
        body.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        toggle.textContent = 'Collapse ▴';
      }

      var form = card.querySelector('.admin-add-form');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        handleAdd(p.slug, form, card);
      });

      wireProjectCard(p, card);
    });
  }

  function renderProject(p) {
    var videosHtml = (p.videos || [])
      .map(function (v) {
        return (
          '<li class="admin-video-item">' +
          '<img src="https://img.youtube.com/vi/' + escapeHtml(v.youtube_id) + '/default.jpg" alt="">' +
          '<span class="label">' + escapeHtml(v.label) + '</span>' +
          '<button class="delete-btn" type="button" data-id="' + escapeHtml(v.youtube_id) + '" title="Delete">&times;</button>' +
          '</li>'
        );
      })
      .join('');

    return (
      '<div class="admin-project" data-project="' + escapeHtml(p.slug) + '">' +
      '<div class="admin-project-head">' +
      '<h2>' + escapeHtml(p.name) + '</h2>' +
      '<button type="button" class="admin-project-toggle" aria-expanded="false">Manage ▾</button>' +
      '</div>' +
      '<div class="admin-project-body" hidden>' +
      buildEditDetailsSection() +
      buildImagesSection(p) +
      buildHeroVideoSection() +
      buildGallerySection(p) +
      buildBrochureSection(p) +
      '<section class="admin-edit-section">' +
      '<h3>Videos</h3>' +
      '<ul class="admin-video-list">' + (videosHtml || '<li style="color:#8a8578;font-size:0.85rem;">No videos yet.</li>') + '</ul>' +
      '<form class="admin-add-form">' +
      '<input type="text" name="url" placeholder="YouTube URL or ID" required>' +
      '<input type="text" name="label" placeholder="Label (e.g. Drone View)" required>' +
      '<select name="category" required>' +
      '<option value="">Stage…</option>' +
      VIDEO_CATEGORIES.map(function (c) {
        return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
      }).join('') +
      '</select>' +
      '<button type="submit">Add video</button>' +
      '</form>' +
      '<p class="admin-status ep-videos-status"></p>' +
      '</section>' +
      buildTrashSection(p) +
      '</div>' +
      '</div>'
    );
  }

  function setStatus(card, message, isError) {
    var statusEl = card.querySelector('.ep-videos-status');
    statusEl.textContent = message;
    statusEl.className = 'admin-status ep-videos-status' + (message ? (isError ? ' err' : ' ok') : '');
  }

  function handleAdd(slug, form, card) {
    var url = form.elements.url.value.trim();
    var label = form.elements.label.value.trim();
    var category = form.elements.category.value;
    var submitBtn = form.querySelector('button');
    submitBtn.disabled = true;
    setStatus(card, 'Saving…', false);

    fetch('/api/admin/videos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'add', slug: slug, url: url, label: label, category: category }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Failed to add video');
          return data;
        });
      })
      .then(function (data) {
        var p = currentProjects.filter(function (x) { return x.slug === slug; })[0];
        patchLocalProject(slug, { videos: data.videos, trash: mergeTrash(p, { videos: data.trash }) });
      })
      .catch(function (err) {
        setStatus(card, err.message, true);
        submitBtn.disabled = false;
      });
  }

  function loadProjects() {
    listEl.textContent = 'Loading…';
    fetch('/api/admin/projects')
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Failed to load projects');
          return data;
        });
      })
      .then(function (data) {
        currentProjects = data.projects;
        renderProjects(currentProjects);
      })
      .catch(function (err) {
        listEl.textContent = 'Error loading projects: ' + err.message;
      });
  }

  logoutBtn.addEventListener('click', function () {
    fetch('/api/admin/logout', { method: 'POST' }).finally(function () {
      window.location.href = './login.html';
    });
  });

  // ---------------------------------------------------------------------
  // Create Project
  // ---------------------------------------------------------------------

  function slugify(str) {
    return String(str || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // container is a DOM element (not an id) so the same helpers work for both
  // the create form's fixed-id lists and the many per-project dyn-lists in
  // the edit forms, which can't all have globally-unique ids.
  function makeDynRow(container, isKv) {
    var row = document.createElement('div');
    row.className = 'dyn-row';
    if (isKv) {
      row.innerHTML =
        '<input type="text" class="dyn-key" placeholder="Label (e.g. Location)">' +
        '<input type="text" class="dyn-val" placeholder="Value">' +
        '<button type="button" class="dyn-remove-btn" title="Remove">&times;</button>';
    } else {
      row.innerHTML =
        '<input type="text" class="dyn-val" placeholder="Text">' +
        '<button type="button" class="dyn-remove-btn" title="Remove">&times;</button>';
    }
    row.querySelector('.dyn-remove-btn').addEventListener('click', function () {
      row.remove();
    });
    container.appendChild(row);
    return row;
  }

  document.querySelectorAll('.dyn-add-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      makeDynRow(document.getElementById(btn.getAttribute('data-target')), btn.getAttribute('data-kv') === 'true');
    });
  });

  // One empty row each - enough to show the shape of the list without
  // filling the form with blanks before anything has been typed.
  ['cp-amenities', 'cp-ledger', 'cp-facts'].forEach(function (id) {
    makeDynRow(document.getElementById(id), false);
  });
  makeDynRow(document.getElementById('cp-specs'), true);

  function collectDynList(container) {
    return Array.prototype.slice
      .call(container.querySelectorAll('.dyn-row'))
      .map(function (row) {
        return row.querySelector('.dyn-val').value.trim();
      })
      .filter(Boolean);
  }

  function collectDynKvList(container) {
    return Array.prototype.slice
      .call(container.querySelectorAll('.dyn-row'))
      .map(function (row) {
        return { k: row.querySelector('.dyn-key').value.trim(), v: row.querySelector('.dyn-val').value.trim() };
      })
      .filter(function (s) {
        return s.k && s.v;
      });
  }

  var nameInput = document.getElementById('cp-name');
  var slugInput = document.getElementById('cp-slug');
  var slugTouched = false;
  slugInput.addEventListener('input', function () {
    slugTouched = true;
  });
  nameInput.addEventListener('input', function () {
    if (!slugTouched) slugInput.value = slugify(nameInput.value);
  });

  // Downscales an uploaded image client-side (long edge capped) and
  // re-encodes as JPEG before base64-ing it — keeps the request well under
  // Vercel's fixed 4.5MB body limit regardless of what the user uploads.
  function resizeImageToBase64(file, maxDim) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale);
        var h = Math.round(img.height * scale);
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ content: dataUrl.split(',')[1], filename: (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg' });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read "' + file.name + '" as an image.'));
      };
      img.src = url;
    });
  }

  function setCreateStatus(message, isError) {
    var el = document.getElementById('create-status');
    el.textContent = message;
    el.className = 'admin-status' + (message ? (isError ? ' err' : ' ok') : '');
  }

  function showCreateFollowup(slug, name) {
    var el = document.getElementById('create-followup');
    el.hidden = false;
    el.innerHTML =
      '<p class="admin-followup-note">"' + escapeHtml(name) + '" is live at ' +
      '<a href="/projects/' + escapeHtml(slug) + '.html" target="_blank" rel="noopener">/projects/' + escapeHtml(slug) + '.html</a>. ' +
      'Add gallery photos and the brochure PDF below whenever you have them — these can be added one at a time, later too.</p>' +
      '<div class="admin-followup-block">' +
      '<h3>Add a gallery photo</h3>' +
      '<input type="file" id="fu-gallery-file" accept="image/*">' +
      '<input type="text" id="fu-gallery-caption" placeholder="Caption (e.g. Master layout plan)">' +
      '<button type="button" class="admin-btn" id="fu-gallery-submit">Add photo</button>' +
      '<p class="admin-status" id="fu-gallery-status"></p>' +
      '</div>' +
      '<div class="admin-followup-block">' +
      '<h3>Upload brochure PDF</h3>' +
      '<input type="file" id="fu-brochure-file" accept="application/pdf">' +
      '<button type="button" class="admin-btn" id="fu-brochure-submit">Upload brochure</button>' +
      '<p class="admin-status" id="fu-brochure-status"></p>' +
      '</div>';

    if (extractedBrochureFile) {
      var dt = new DataTransfer();
      dt.items.add(extractedBrochureFile);
      document.getElementById('fu-brochure-file').files = dt.files;
    }

    document.getElementById('fu-gallery-submit').addEventListener('click', function () {
      var fileInput = document.getElementById('fu-gallery-file');
      var caption = document.getElementById('fu-gallery-caption').value.trim();
      var statusEl = document.getElementById('fu-gallery-status');
      if (!fileInput.files[0] || !caption) {
        statusEl.textContent = 'Choose a photo and enter a caption.';
        statusEl.className = 'admin-status err';
        return;
      }
      statusEl.textContent = 'Uploading…';
      statusEl.className = 'admin-status';
      resizeImageToBase64(fileInput.files[0], 2000)
        .then(function (fileData) {
          return fetch('/api/admin/gallery', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'add', slug: slug, file: fileData, caption: caption }),
          });
        })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || 'Failed to add photo');
            return data;
          });
        })
        .then(function () {
          statusEl.textContent = 'Added — live in about a minute.';
          statusEl.className = 'admin-status ok';
          fileInput.value = '';
          document.getElementById('fu-gallery-caption').value = '';
        })
        .catch(function (err) {
          statusEl.textContent = err.message;
          statusEl.className = 'admin-status err';
        });
    });

    document.getElementById('fu-brochure-submit').addEventListener('click', function () {
      var fileInput = document.getElementById('fu-brochure-file');
      var statusEl = document.getElementById('fu-brochure-status');
      var file = fileInput.files[0];
      if (!file) {
        statusEl.textContent = 'Choose a PDF first.';
        statusEl.className = 'admin-status err';
        return;
      }
      statusEl.textContent = 'Uploading…';
      statusEl.className = 'admin-status';
      var reader = new FileReader();
      reader.onload = function () {
        var base64 = reader.result.split(',')[1];
        fetch('/api/admin/brochure', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug: slug, file: { content: base64, filename: file.name, mime: file.type } }),
        })
          .then(function (res) {
            return res.json().then(function (data) {
              if (!res.ok) throw new Error(data.error || 'Failed to upload brochure');
              return data;
            });
          })
          .then(function () {
            statusEl.textContent = 'Uploaded — live in about a minute.';
            statusEl.className = 'admin-status ok';
          })
          .catch(function (err) {
            statusEl.textContent = err.message;
            statusEl.className = 'admin-status err';
          });
      };
      reader.onerror = function () {
        statusEl.textContent = 'Could not read that file.';
        statusEl.className = 'admin-status err';
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------------------------------------------------------------------
  // Extract fields from a brochure PDF
  // ---------------------------------------------------------------------

  var extractedBrochureFile = null;
  var extractedPdfDoc = null;

  // Where a picked brochure page can be sent. maxDim mirrors the cap the
  // manual-upload path applies to that same field on submit. Each target is
  // independent, so one page can back several fields at once.
  var PICK_TARGETS = {
    logo: { inputId: 'cp-file-logo', noteId: 'cp-logo-source', selectId: 'cp-logo-page', previewId: 'cp-logo-preview', maxDim: 800, label: 'Logo' },
    card: { inputId: 'cp-file-card', noteId: 'cp-card-source', selectId: 'cp-card-page', previewId: 'cp-card-preview', maxDim: 2000, label: 'Card / hero' },
    plan: { inputId: 'cp-file-plan', noteId: 'cp-plan-source', selectId: 'cp-plan-page', previewId: 'cp-plan-preview', maxDim: 2400, label: 'Master layout plan' },
  };

  var FIELD_ROW_MAP = {
    name: nameInput,
    tagline: document.getElementById('cp-tagline'),
    location: document.getElementById('cp-location'),
    about: document.getElementById('cp-about'),
    rera: document.getElementById('cp-rera'),
    lp_badge: document.getElementById('cp-lp-badge'),
    amenities: document.getElementById('cp-amenities'),
    specs: document.getElementById('cp-specs'),
    ledger: document.getElementById('cp-ledger'),
    facts: document.getElementById('cp-facts'),
  };

  function markAutoFilled(el) {
    el.classList.add('auto-filled');
    function clear() {
      el.classList.remove('auto-filled');
      el.removeEventListener('input', clear);
    }
    el.addEventListener('input', clear);
  }

  function markRowAutoFilled(row) {
    row.classList.add('auto-filled');
    var inputs = Array.prototype.slice.call(row.querySelectorAll('input'));
    function clear() {
      row.classList.remove('auto-filled');
      inputs.forEach(function (inp) { inp.removeEventListener('input', clear); });
    }
    inputs.forEach(function (inp) { inp.addEventListener('input', clear); });
  }

  function markNeedsReview(fieldRow) {
    if (fieldRow.querySelector('.review-note')) return;
    var note = document.createElement('small');
    note.className = 'review-note';
    note.textContent = 'Not found in brochure — please fill in.';
    var label = fieldRow.querySelector('label');
    if (label) label.insertAdjacentElement('afterend', note);
    else fieldRow.insertBefore(note, fieldRow.firstChild);
  }

  function canvasToBase64Jpeg(canvas) {
    return canvas.toDataURL('image/jpeg', 0.75).split(',')[1];
  }

  function loadPdfDocument(file) {
    if (!window.pdfjsLib) {
      return Promise.reject(new Error('PDF reader did not load — check your connection and try again'));
    }
    return file.arrayBuffer().then(function (buf) {
      return window.pdfjsLib.getDocument({ data: buf }).promise;
    });
  }

  // A PDF page's scale-1 viewport is its point size (~595x842 for A4), so the
  // vision pass renders at scale <= 1, while pages picked as real site imagery
  // need upscaling past that to reach usable pixel dimensions.
  function renderPdfPage(pdf, num, maxDim, allowUpscale) {
    return pdf.getPage(num).then(function (page) {
      var baseViewport = page.getViewport({ scale: 1 });
      var scale = maxDim / Math.max(baseViewport.width, baseViewport.height);
      if (!allowUpscale) scale = Math.min(1, scale);
      var viewport = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      return page
        .render({ canvasContext: canvas.getContext('2d'), viewport: viewport })
        .promise.then(function () {
          return canvas;
        });
    });
  }

  function renderPdfPagesToBase64(pdf, maxDim) {
    var pageNums = [];
    for (var i = 1; i <= pdf.numPages; i++) pageNums.push(i);
    return pageNums.reduce(function (chain, num) {
      return chain.then(function (acc) {
        return renderPdfPage(pdf, num, maxDim, false).then(function (canvas) {
          acc.push({ content: canvasToBase64Jpeg(canvas) });
          return acc;
        });
      });
    }, Promise.resolve([]));
  }

  function setExtractStatus(message, isError) {
    var el = document.getElementById('extract-status');
    el.textContent = message;
    el.className = 'admin-status' + (message ? (isError ? ' err' : ' ok') : '');
  }

  function clearDynList(container) {
    container.innerHTML = '';
  }

  function applyExtractedFields(fields) {
    [
      ['cp-name', 'name'],
      ['cp-tagline', 'tagline'],
      ['cp-location', 'location'],
      ['cp-about', 'about'],
      ['cp-rera', 'rera'],
      ['cp-lp-badge', 'lp_badge'],
    ].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      var val = fields[pair[1]];
      if (val) {
        el.value = val;
        markAutoFilled(el);
      }
    });

    if (fields.name && !slugTouched) {
      slugInput.value = slugify(fields.name);
    }

    function fillList(containerId, items) {
      var container = document.getElementById(containerId);
      clearDynList(container);
      if (!items || !items.length) {
        makeDynRow(container, false);
        return;
      }
      items.forEach(function (text) {
        var row = makeDynRow(container, false);
        row.querySelector('.dyn-val').value = text;
        markRowAutoFilled(row);
      });
    }

    function fillKvList(containerId, items) {
      var container = document.getElementById(containerId);
      clearDynList(container);
      if (!items || !items.length) {
        makeDynRow(container, true);
        return;
      }
      items.forEach(function (item) {
        var row = makeDynRow(container, true);
        row.querySelector('.dyn-key').value = item.k || '';
        row.querySelector('.dyn-val').value = item.v || '';
        markRowAutoFilled(row);
      });
    }

    fillList('cp-amenities', fields.amenities);
    fillKvList('cp-specs', fields.specs);
    fillList('cp-ledger', fields.ledger);
    fillList('cp-facts', fields.facts);

    (fields.unresolved || []).forEach(function (name) {
      var el = FIELD_ROW_MAP[name];
      var row = el && el.closest('.field-row');
      if (row) markNeedsReview(row);
    });
  }

  function canvasToJpegFile(canvas, filename) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (blob) {
          if (!blob) {
            reject(new Error('Could not turn that page into an image.'));
            return;
          }
          resolve(new File([blob], filename, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.9
      );
    });
  }

  function setSourceNote(noteId, message, state) {
    var el = document.getElementById(noteId);
    el.textContent = message;
    el.className = 'admin-status' + (state ? ' ' + state : '');
  }

  function clearFileInput(inputId) {
    document.getElementById(inputId).value = '';
  }

  function setPreview(previewId, file) {
    var el = document.getElementById(previewId);
    if (!file) {
      el.innerHTML = '<span>Nothing chosen</span>';
      return;
    }
    var img = document.createElement('img');
    img.alt = '';
    var url = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(url);
    };
    img.src = url;
    el.innerHTML = '';
    el.appendChild(img);
  }

  function pickPageFor(kind, pageNum) {
    var target = PICK_TARGETS[kind];
    if (!extractedPdfDoc || !target) return;

    var select = document.getElementById(target.selectId);
    select.disabled = true;
    setSourceNote(target.noteId, 'Preparing page ' + pageNum + '…', '');

    renderPdfPage(extractedPdfDoc, pageNum, target.maxDim, true)
      .then(function (canvas) {
        return canvasToJpegFile(canvas, 'brochure-p' + pageNum + '-' + kind + '.jpg');
      })
      .then(function (file) {
        // Assigning .files directly does not fire a change event, so the
        // manual-selection listener below stays quiet for programmatic picks.
        var dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById(target.inputId).files = dt.files;
        setPreview(target.previewId, file);
        setSourceNote(target.noteId, 'Using brochure page ' + pageNum + '.', 'ok');
      })
      .catch(function (err) {
        setSourceNote(target.noteId, err.message, 'err');
      })
      .finally(function () {
        select.disabled = false;
      });
  }

  Object.keys(PICK_TARGETS).forEach(function (kind) {
    var target = PICK_TARGETS[kind];

    // A manual upload wins over whatever page was picked, and vice versa -
    // whichever the admin touched last is the one that ends up in the input.
    document.getElementById(target.inputId).addEventListener('change', function (e) {
      document.getElementById(target.selectId).value = '';
      setPreview(target.previewId, e.target.files[0]);
      setSourceNote(target.noteId, '', '');
    });

    document.getElementById(target.selectId).addEventListener('change', function (e) {
      var value = e.target.value;
      if (!value) {
        clearFileInput(target.inputId);
        setPreview(target.previewId, null);
        setSourceNote(target.noteId, '', '');
        return;
      }
      pickPageFor(kind, parseInt(value, 10));
    });
  });

  function renderPagePicker(pages) {
    var strip = document.getElementById('page-picker-strip');
    strip.innerHTML = pages
      .map(function (page, i) {
        var num = i + 1;
        return (
          '<div class="page-thumb">' +
          '<img src="data:image/jpeg;base64,' + page.content + '" alt="Brochure page ' + num + '">' +
          '<span class="page-thumb-num">Page ' + num + '</span>' +
          '</div>'
        );
      })
      .join('');

    var options =
      '<option value="">Upload a file instead</option>' +
      pages
        .map(function (page, i) {
          return '<option value="' + (i + 1) + '">Brochure page ' + (i + 1) + '</option>';
        })
        .join('');

    Object.keys(PICK_TARGETS).forEach(function (kind) {
      var target = PICK_TARGETS[kind];
      var select = document.getElementById(target.selectId);
      select.innerHTML = options;
      select.value = '';
      select.disabled = false;
    });

    document.getElementById('page-picker').hidden = false;
  }

  document.getElementById('extract-brochure-btn').addEventListener('click', function () {
    var fileInput = document.getElementById('cp-brochure-file');
    var file = fileInput.files[0];
    if (!file) {
      setExtractStatus('Choose a brochure PDF first.', true);
      return;
    }
    extractedBrochureFile = file;
    var btn = document.getElementById('extract-brochure-btn');
    btn.disabled = true;
    setExtractStatus('Reading brochure pages…', false);

    loadPdfDocument(file)
      .then(function (pdf) {
        extractedPdfDoc = pdf;
        return renderPdfPagesToBase64(pdf, 1600);
      })
      .then(function (pages) {
        renderPagePicker(pages);
        setExtractStatus('Extracting with AI… this can take up to a minute.', false);
        return fetch('/api/admin/extract-brochure', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pages: pages }),
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Extraction failed');
          return data;
        });
      })
      .then(function (data) {
        applyExtractedFields(data.fields);
        setExtractStatus('Done — review the highlighted fields below before submitting.', false);
      })
      .catch(function (err) {
        setExtractStatus(err.message + ' — please fill in the form manually.', true);
      })
      .finally(function () {
        btn.disabled = false;
      });
  });

  var createForm = document.getElementById('create-project-form');
  createForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var submitBtn = document.getElementById('cp-submit');
    var name = nameInput.value.trim();
    submitBtn.disabled = true;
    setCreateStatus('Saving… (processing images, this can take a bit)', false);

    var logoFile = document.getElementById('cp-file-logo').files[0];
    var cardFile = document.getElementById('cp-file-card').files[0];
    var planFile = document.getElementById('cp-file-plan').files[0];

    var missing = Object.keys(PICK_TARGETS)
      .filter(function (kind) {
        return !document.getElementById(PICK_TARGETS[kind].inputId).files[0];
      })
      .map(function (kind) {
        return PICK_TARGETS[kind].label;
      });

    if (missing.length) {
      setCreateStatus('Still needed: ' + missing.join(', ') + '. Pick a brochure page or upload a file.', true);
      submitBtn.disabled = false;
      return;
    }

    Promise.all([
      resizeImageToBase64(logoFile, 800),
      resizeImageToBase64(cardFile, 2000),
      resizeImageToBase64(planFile, 2400),
    ])
      .then(function (files) {
        var payload = {
          name: name,
          slug: slugInput.value.trim() || undefined,
          tagline: document.getElementById('cp-tagline').value.trim(),
          location: document.getElementById('cp-location').value.trim(),
          about: document.getElementById('cp-about').value.trim(),
          rera: document.getElementById('cp-rera').value.trim(),
          lp_badge: document.getElementById('cp-lp-badge').value.trim(),
          amenities: collectDynList(document.getElementById('cp-amenities')),
          specs: collectDynKvList(document.getElementById('cp-specs')),
          ledger: collectDynList(document.getElementById('cp-ledger')),
          facts: collectDynList(document.getElementById('cp-facts')),
          sold_out: document.getElementById('cp-sold-out').checked,
          card_anchor: document.getElementById('cp-card-anchor').value,
          files: { logo: files[0], card: files[1], plan: files[2] },
        };

        return fetch('/api/admin/create-project', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Failed to create project');
          return data;
        });
      })
      .then(function (data) {
        setCreateStatus('Created — live in about a minute.', false);
        showCreateFollowup(data.slug, name);
        loadProjects();
      })
      .catch(function (err) {
        setCreateStatus(err.message, true);
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });

  // ---------------------------------------------------------------------
  // Edit existing project (details / images / hero video / gallery /
  // brochure / recently-deleted). All values are inserted into the DOM as
  // empty-then-filled inputs (.value = ...) rather than baked into the
  // HTML string as `value="..."` attributes - captions and free text can
  // contain quote characters that escapeHtml() does not escape inside
  // attributes (it only escapes &/</> the way a text node needs).
  // ---------------------------------------------------------------------

  function stemOf(filename) {
    var dot = filename.lastIndexOf('.');
    return dot === -1 ? filename : filename.slice(0, dot);
  }

  function buildEditDetailsSection() {
    return (
      '<section class="admin-edit-section">' +
      '<h3>Project details</h3>' +
      '<div class="field-grid">' +
      '<div class="field-row"><label>Tagline</label><input type="text" class="ep-tagline"></div>' +
      '<div class="field-row"><label>Location</label><input type="text" class="ep-location"></div>' +
      '<div class="field-row"><label>Approval text</label><input type="text" class="ep-rera"></div>' +
      '<div class="field-row"><label>Approval badge</label><input type="text" class="ep-lp-badge"></div>' +
      '</div>' +
      '<div class="field-row"><label>About</label><textarea class="ep-about" rows="3"></textarea></div>' +
      '<div class="field-row"><label>Amenities</label><div class="dyn-list ep-amenities"></div><button type="button" class="dyn-add-btn ep-add-amenity">+ Add amenity</button></div>' +
      '<div class="field-row"><label>Facts table</label><div class="dyn-list dyn-list-kv ep-specs"></div><button type="button" class="dyn-add-btn ep-add-spec">+ Add row</button></div>' +
      '<div class="field-row"><label>Hero highlights</label><div class="dyn-list ep-ledger"></div><button type="button" class="dyn-add-btn ep-add-ledger">+ Add highlight</button></div>' +
      '<div class="field-row"><label>Project card lines</label><div class="dyn-list ep-facts"></div><button type="button" class="dyn-add-btn ep-add-fact">+ Add line</button></div>' +
      '<div class="field-row field-row-checkbox"><label><input type="checkbox" class="ep-sold-out"> Sold out / fully booked</label></div>' +
      '<button type="button" class="admin-btn admin-btn-secondary ep-save-details">Save details</button>' +
      '<p class="admin-status ep-details-status"></p>' +
      '</section>'
    );
  }

  function buildImagesSection(p) {
    var slug = escapeHtml(p.slug);
    return (
      '<section class="admin-edit-section">' +
      '<h3>Images</h3>' +
      '<div class="image-picker">' +
      '<div class="image-preview"><img src="../assets/images/projects/' + slug + '/img-0-logo.jpeg" alt=""></div>' +
      '<div class="image-picker-controls"><label>Project logo</label><input type="file" class="ep-file-logo" accept="image/*"><p class="admin-status ep-logo-status"></p></div>' +
      '</div>' +
      '<div class="image-picker">' +
      '<div class="image-preview"><img src="../assets/images/derived/' + slug + '/card.jpg" alt=""></div>' +
      '<div class="image-picker-controls"><label>Card / hero image</label><input type="file" class="ep-file-card" accept="image/*">' +
      '<label class="sub-label">Crop from</label><select class="ep-card-anchor"><option value="center">Center (default)</option><option value="top">Top</option></select>' +
      '<p class="admin-status ep-card-status"></p></div>' +
      '</div>' +
      '<div class="image-picker">' +
      '<div class="image-preview"><img src="../assets/images/derived/' + slug + '/plan.jpg" alt=""></div>' +
      '<div class="image-picker-controls"><label>Master layout plan</label><input type="file" class="ep-file-plan" accept="image/*"><p class="admin-status ep-plan-status"></p></div>' +
      '</div>' +
      '<button type="button" class="admin-btn admin-btn-secondary ep-save-images">Save images</button>' +
      '<p class="admin-status ep-images-status"></p>' +
      '</section>'
    );
  }

  function buildHeroVideoSection() {
    return (
      '<section class="admin-edit-section">' +
      '<h3>Hero background video</h3>' +
      '<p class="field-hint">Plays muted behind the hero on desktop only. Leave the URL blank and save to remove it.</p>' +
      '<div class="field-grid">' +
      '<div class="field-row"><label>YouTube URL or ID</label><input type="text" class="ep-hero-yt" placeholder="https://youtube.com/watch?v=…"></div>' +
      '<div class="field-row"><label>Start / end (seconds)</label><div class="admin-hero-range"><input type="text" class="ep-hero-start" placeholder="Start"><input type="text" class="ep-hero-end" placeholder="End"></div></div>' +
      '</div>' +
      '<button type="button" class="admin-btn admin-btn-secondary ep-save-hero">Save hero video</button>' +
      '<p class="admin-status ep-hero-status"></p>' +
      '</section>'
    );
  }

  function buildGalleryItem(slug, g) {
    var stem = escapeHtml(stemOf(g.src));
    return (
      '<div class="admin-gallery-item">' +
      '<img src="../assets/images/derived/' + escapeHtml(slug) + '/thumb-' + stem + '.jpg" alt="">' +
      '<span class="cap">' + escapeHtml(g.cap) + '</span>' +
      '<button type="button" class="delete-btn gallery-delete-btn" data-src="' + escapeHtml(g.src) + '" title="Delete">&times;</button>' +
      '</div>'
    );
  }

  function buildGallerySection(p) {
    var items = (p.gallery || []).map(function (g) { return buildGalleryItem(p.slug, g); }).join('');
    return (
      '<section class="admin-edit-section">' +
      '<h3>Gallery</h3>' +
      '<div class="admin-gallery-grid">' + (items || '<p class="field-hint">No gallery photos yet.</p>') + '</div>' +
      '<div class="admin-gallery-add">' +
      '<input type="file" class="ep-gallery-file" accept="image/*">' +
      '<input type="text" class="ep-gallery-caption" placeholder="Caption (e.g. Amenities & location plan)">' +
      '<button type="button" class="admin-btn admin-btn-secondary ep-gallery-add-btn">Add photo</button>' +
      '</div>' +
      '<p class="admin-status ep-gallery-status"></p>' +
      '</section>'
    );
  }

  function buildBrochureSection(p) {
    var slug = escapeHtml(p.slug);
    return (
      '<section class="admin-edit-section">' +
      '<h3>Brochure PDF</h3>' +
      '<p class="field-hint"><a href="../assets/brochures/' + slug + '.pdf" target="_blank" rel="noopener">View current brochure</a></p>' +
      '<input type="file" class="ep-brochure-file" accept="application/pdf">' +
      '<button type="button" class="admin-btn admin-btn-secondary ep-brochure-btn">Upload / replace</button>' +
      '<p class="admin-status ep-brochure-status"></p>' +
      '</section>'
    );
  }

  function buildTrashSection(p) {
    var trashVideos = (p.trash && p.trash.videos) || [];
    var trashGallery = (p.trash && p.trash.gallery) || [];
    var count = trashVideos.length + trashGallery.length;
    if (!count) return '';

    var videoItems = trashVideos
      .map(function (v) {
        return (
          '<li class="admin-video-item">' +
          '<img src="https://img.youtube.com/vi/' + escapeHtml(v.youtube_id) + '/default.jpg" alt="">' +
          '<span class="label">' + escapeHtml(v.label) + '</span>' +
          '<button type="button" class="restore-btn restore-video-btn" data-id="' + escapeHtml(v.youtube_id) + '">Restore</button>' +
          '</li>'
        );
      })
      .join('');

    var galleryItems = trashGallery
      .map(function (g) {
        var stem = escapeHtml(stemOf(g.src));
        return (
          '<li class="admin-video-item">' +
          '<img src="../assets/images/derived/' + escapeHtml(p.slug) + '/thumb-' + stem + '.jpg" alt="">' +
          '<span class="label">' + escapeHtml(g.cap) + '</span>' +
          '<button type="button" class="restore-btn restore-gallery-btn" data-src="' + escapeHtml(g.src) + '">Restore</button>' +
          '</li>'
        );
      })
      .join('');

    return (
      '<details class="admin-trash-block">' +
      '<summary>Recently deleted (' + count + ')</summary>' +
      '<ul class="admin-video-list">' + videoItems + galleryItems + '</ul>' +
      '<p class="admin-status ep-trash-status"></p>' +
      '</details>'
    );
  }

  function setEpStatus(el, message, isError) {
    el.textContent = message;
    el.className = 'admin-status' + (message ? (isError ? ' err' : ' ok') : '');
  }

  function wireProjectCard(p, card) {
    var toggle = card.querySelector('.admin-project-toggle');
    var body = card.querySelector('.admin-project-body');
    toggle.addEventListener('click', function () {
      var open = body.hidden;
      body.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Collapse ▴' : 'Manage ▾';
    });

    // --- Details ---
    var tagline = card.querySelector('.ep-tagline');
    var location = card.querySelector('.ep-location');
    var rera = card.querySelector('.ep-rera');
    var lpBadge = card.querySelector('.ep-lp-badge');
    var about = card.querySelector('.ep-about');
    var soldOut = card.querySelector('.ep-sold-out');
    tagline.value = p.tagline || '';
    location.value = p.location || '';
    rera.value = p.rera || '';
    lpBadge.value = p.lp_badge || '';
    about.value = p.about || '';
    soldOut.checked = Boolean(p.sold_out);

    var amenitiesEl = card.querySelector('.ep-amenities');
    var specsEl = card.querySelector('.ep-specs');
    var ledgerEl = card.querySelector('.ep-ledger');
    var factsEl = card.querySelector('.ep-facts');
    (p.amenities && p.amenities.length ? p.amenities : ['']).forEach(function (v) {
      makeDynRow(amenitiesEl, false).querySelector('.dyn-val').value = v;
    });
    (p.specs && p.specs.length ? p.specs : [{ k: '', v: '' }]).forEach(function (s) {
      var row = makeDynRow(specsEl, true);
      row.querySelector('.dyn-key').value = s.k || '';
      row.querySelector('.dyn-val').value = s.v || '';
    });
    (p.ledger && p.ledger.length ? p.ledger : ['']).forEach(function (v) {
      makeDynRow(ledgerEl, false).querySelector('.dyn-val').value = v;
    });
    (p.facts && p.facts.length ? p.facts : ['']).forEach(function (v) {
      makeDynRow(factsEl, false).querySelector('.dyn-val').value = v;
    });

    card.querySelector('.ep-add-amenity').addEventListener('click', function () { makeDynRow(amenitiesEl, false); });
    card.querySelector('.ep-add-spec').addEventListener('click', function () { makeDynRow(specsEl, true); });
    card.querySelector('.ep-add-ledger').addEventListener('click', function () { makeDynRow(ledgerEl, false); });
    card.querySelector('.ep-add-fact').addEventListener('click', function () { makeDynRow(factsEl, false); });

    card.querySelector('.ep-save-details').addEventListener('click', function () {
      handleSaveDetails(p, card);
    });

    // --- Images ---
    var cardAnchorSel = card.querySelector('.ep-card-anchor');
    cardAnchorSel.value = p.card_anchor === 'top' ? 'top' : 'center';
    card.querySelector('.ep-save-images').addEventListener('click', function () {
      handleSaveImages(p, card);
    });

    // --- Hero video ---
    var heroYt = card.querySelector('.ep-hero-yt');
    var heroStart = card.querySelector('.ep-hero-start');
    var heroEnd = card.querySelector('.ep-hero-end');
    if (p.hero_video) {
      heroYt.value = p.hero_video.youtube_id || '';
      heroStart.value = p.hero_video.start || '';
      heroEnd.value = p.hero_video.end || '';
    }
    card.querySelector('.ep-save-hero').addEventListener('click', function () {
      handleSaveHeroVideo(p, card);
    });

    // --- Videos: delete (restore is wired below, under Recently deleted) ---
    card.querySelectorAll('.delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleVideoAction(p.slug, 'delete', btn.getAttribute('data-id'), card);
      });
    });

    // --- Gallery ---
    card.querySelectorAll('.gallery-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleGalleryAction(p.slug, 'delete', btn.getAttribute('data-src'), null, card);
      });
    });
    card.querySelector('.ep-gallery-add-btn').addEventListener('click', function () {
      handleGalleryAdd(p, card);
    });

    // --- Brochure ---
    card.querySelector('.ep-brochure-btn').addEventListener('click', function () {
      handleBrochureUpload(p, card);
    });

    // --- Recently deleted ---
    card.querySelectorAll('.restore-video-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleVideoAction(p.slug, 'restore', btn.getAttribute('data-id'), card);
      });
    });
    card.querySelectorAll('.restore-gallery-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleGalleryAction(p.slug, 'restore', btn.getAttribute('data-src'), null, card);
      });
    });
  }

  function handleSaveDetails(p, card) {
    var statusEl = card.querySelector('.ep-details-status');
    var btn = card.querySelector('.ep-save-details');
    btn.disabled = true;
    setEpStatus(statusEl, 'Saving…', false);

    var payload = {
      slug: p.slug,
      tagline: card.querySelector('.ep-tagline').value.trim(),
      location: card.querySelector('.ep-location').value.trim(),
      about: card.querySelector('.ep-about').value.trim(),
      rera: card.querySelector('.ep-rera').value.trim(),
      lp_badge: card.querySelector('.ep-lp-badge').value.trim(),
      amenities: collectDynList(card.querySelector('.ep-amenities')),
      specs: collectDynKvList(card.querySelector('.ep-specs')),
      ledger: collectDynList(card.querySelector('.ep-ledger')),
      facts: collectDynList(card.querySelector('.ep-facts')),
      sold_out: card.querySelector('.ep-sold-out').checked,
    };

    postUpdateProject(payload)
      .then(function (data) {
        setEpStatus(statusEl, data.unchanged ? 'No changes to save.' : 'Saved — live in about a minute.', false);
        if (data.project) patchLocalProject(p.slug, data.project);
      })
      .catch(function (err) {
        setEpStatus(statusEl, err.message, true);
      })
      .finally(function () {
        btn.disabled = false;
      });
  }

  function handleSaveImages(p, card) {
    var statusEl = card.querySelector('.ep-images-status');
    var btn = card.querySelector('.ep-save-images');
    var logoFile = card.querySelector('.ep-file-logo').files[0];
    var cardFile = card.querySelector('.ep-file-card').files[0];
    var planFile = card.querySelector('.ep-file-plan').files[0];
    var anchor = card.querySelector('.ep-card-anchor').value;

    if (!logoFile && !cardFile && !planFile) {
      setEpStatus(statusEl, 'Choose at least one image to upload.', true);
      return;
    }

    btn.disabled = true;
    setEpStatus(statusEl, 'Uploading…', false);

    Promise.all([
      logoFile ? resizeImageToBase64(logoFile, 800) : null,
      cardFile ? resizeImageToBase64(cardFile, 2000) : null,
      planFile ? resizeImageToBase64(planFile, 2400) : null,
    ])
      .then(function (files) {
        var payload = { slug: p.slug, card_anchor: anchor, files: {} };
        if (files[0]) payload.files.logo = files[0];
        if (files[1]) payload.files.card = files[1];
        if (files[2]) payload.files.plan = files[2];
        return postUpdateProject(payload);
      })
      .then(function (data) {
        setEpStatus(statusEl, data.unchanged ? 'No changes to save.' : 'Saved — live in about a minute.', false);
        if (data.project) patchLocalProject(p.slug, data.project);
      })
      .catch(function (err) {
        setEpStatus(statusEl, err.message, true);
      })
      .finally(function () {
        btn.disabled = false;
      });
  }

  function handleSaveHeroVideo(p, card) {
    var statusEl = card.querySelector('.ep-hero-status');
    var btn = card.querySelector('.ep-save-hero');
    var url = card.querySelector('.ep-hero-yt').value.trim();
    var start = card.querySelector('.ep-hero-start').value.trim();
    var end = card.querySelector('.ep-hero-end').value.trim();

    btn.disabled = true;
    setEpStatus(statusEl, 'Saving…', false);

    var payload = { slug: p.slug, hero_video: url ? { url: url, start: start, end: end } : null };

    postUpdateProject(payload)
      .then(function (data) {
        setEpStatus(statusEl, data.unchanged ? 'No changes to save.' : 'Saved — live in about a minute.', false);
        if (data.project) patchLocalProject(p.slug, data.project);
      })
      .catch(function (err) {
        setEpStatus(statusEl, err.message, true);
      })
      .finally(function () {
        btn.disabled = false;
      });
  }

  function postUpdateProject(payload) {
    return fetch('/api/admin/update-project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Failed to save');
        return data;
      });
    });
  }

  function handleGalleryAdd(p, card) {
    var statusEl = card.querySelector('.ep-gallery-status');
    var btn = card.querySelector('.ep-gallery-add-btn');
    var file = card.querySelector('.ep-gallery-file').files[0];
    var caption = card.querySelector('.ep-gallery-caption').value.trim();
    if (!file || !caption) {
      setEpStatus(statusEl, 'Choose a photo and enter a caption.', true);
      return;
    }
    btn.disabled = true;
    setEpStatus(statusEl, 'Uploading…', false);
    resizeImageToBase64(file, 2000)
      .then(function (fileData) {
        return fetch('/api/admin/gallery', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'add', slug: p.slug, file: fileData, caption: caption }),
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Failed to add photo');
          return data;
        });
      })
      .then(function (data) {
        patchLocalProject(p.slug, { gallery: data.gallery, trash: mergeTrash(p, { gallery: data.trash }) });
      })
      .catch(function (err) {
        setEpStatus(statusEl, err.message, true);
        btn.disabled = false;
      });
  }

  function handleGalleryAction(slug, action, src, _unused, card) {
    if (action === 'delete' && !window.confirm('Delete this gallery photo? You can restore it from "Recently deleted" afterwards.')) return;
    var statusEl = card.querySelector('.ep-gallery-status') || card.querySelector('.ep-trash-status');
    fetch('/api/admin/gallery', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: action, slug: slug, src: src }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Failed to ' + action + ' photo');
          return data;
        });
      })
      .then(function (data) {
        var p = currentProjects.filter(function (x) { return x.slug === slug; })[0];
        patchLocalProject(slug, { gallery: data.gallery, trash: mergeTrash(p, { gallery: data.trash }) });
      })
      .catch(function (err) {
        if (statusEl) setEpStatus(statusEl, err.message, true);
      });
  }

  function handleVideoAction(slug, action, youtubeId, card) {
    if (action === 'delete' && !window.confirm('Delete this video? You can restore it from "Recently deleted" afterwards.')) return;
    fetch('/api/admin/videos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: action, slug: slug, youtube_id: youtubeId }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Failed to ' + action + ' video');
          return data;
        });
      })
      .then(function (data) {
        var p = currentProjects.filter(function (x) { return x.slug === slug; })[0];
        patchLocalProject(slug, { videos: data.videos, trash: mergeTrash(p, { videos: data.trash }) });
      })
      .catch(function (err) {
        var statusEl = card.querySelector('.ep-trash-status');
        if (statusEl) setEpStatus(statusEl, err.message, true);
      });
  }

  function handleBrochureUpload(p, card) {
    var statusEl = card.querySelector('.ep-brochure-status');
    var btn = card.querySelector('.ep-brochure-btn');
    var file = card.querySelector('.ep-brochure-file').files[0];
    if (!file) {
      setEpStatus(statusEl, 'Choose a PDF first.', true);
      return;
    }
    btn.disabled = true;
    setEpStatus(statusEl, 'Uploading…', false);
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = reader.result.split(',')[1];
      fetch('/api/admin/brochure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: p.slug, file: { content: base64, filename: file.name, mime: file.type } }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || 'Failed to upload brochure');
            return data;
          });
        })
        .then(function () {
          setEpStatus(statusEl, 'Uploaded — live in about a minute.', false);
        })
        .catch(function (err) {
          setEpStatus(statusEl, err.message, true);
        })
        .finally(function () {
          btn.disabled = false;
        });
    };
    reader.onerror = function () {
      setEpStatus(statusEl, 'Could not read that file.', true);
      btn.disabled = false;
    };
    reader.readAsDataURL(file);
  }

  // trash is stored per-kind; a save to one kind (e.g. gallery) must not
  // clobber the other kind's trash list already held in local state.
  function mergeTrash(p, patch) {
    var base = (p && p.trash) || {};
    return {
      videos: patch.videos !== undefined ? patch.videos : base.videos,
      gallery: patch.gallery !== undefined ? patch.gallery : base.gallery,
    };
  }

  function patchLocalProject(slug, patch) {
    currentProjects = currentProjects.map(function (p) {
      return p.slug === slug ? Object.assign({}, p, patch) : p;
    });
    renderProjects(currentProjects);
  }

  loadProjects();
})();
