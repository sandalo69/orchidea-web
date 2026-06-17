(function () {
  var svg = document.getElementById('seat-map-svg');
  if (!svg) return;

  var form = document.getElementById('booking-form');
  var selectedInput = document.getElementById('seat-ids-input');
  var selectedCount = document.getElementById('selected-count');
  var submitBtn = document.getElementById('submit-booking');
  var eventId = parseInt(svg.dataset.eventId, 10);
  var maxSeats = parseInt(svg.dataset.maxSeats, 10);

  var seatData = {};
  var selectedIds = new Set();

  var socket = io();
  socket.emit('join:event', { eventId: eventId });
  socket.on('seats:update', fetchAndRender);

  function fetchAndRender() {
    fetch('/api/events/' + eventId + '/seats')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        seatData = {};
        data.seats.forEach(function (s) { seatData[s.id] = s; });
        // Remove selections that are now occupied
        Array.from(selectedIds).forEach(function (id) {
          if (seatData[id] && seatData[id].stato === 'occupato') selectedIds.delete(id);
        });
        render();
      })
      .catch(function (err) { console.error('Errore caricamento posti:', err); });
  }

  function seatRadius(tipo) {
    if (tipo === 'posto_singolo') return 14;
    if (tipo === 'poltroncina_3') return 18;
    return 22; // tavolo_tondo
  }

  function render() {
    svg.querySelectorAll('.seat, .seat-label').forEach(function (el) { el.remove(); });

    var seats = Object.values(seatData);
    if (seats.length === 0) {
      var placeholder = svg.querySelector('text') || document.createElementNS('http://www.w3.org/2000/svg', 'text');
      placeholder.setAttribute('x', '400');
      placeholder.setAttribute('y', '300');
      placeholder.setAttribute('text-anchor', 'middle');
      placeholder.setAttribute('fill', '#555');
      placeholder.setAttribute('font-size', '16');
      placeholder.textContent = 'Nessun posto configurato per questo evento.';
      svg.appendChild(placeholder);
      updateForm();
      return;
    }

    // Remove placeholder text
    svg.querySelectorAll('text:not(.seat-label)').forEach(function (el) { el.remove(); });

    seats.forEach(function (seat) {
      var isSelected = selectedIds.has(seat.id);
      var r = seatRadius(seat.tipo);
      var cls = 'seat seat-' + (isSelected ? 'selected' : seat.stato);

      var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', cls);
      circle.setAttribute('cx', seat.pos_x);
      circle.setAttribute('cy', seat.pos_y);
      circle.setAttribute('r', r);
      circle.dataset.id = seat.id;

      var title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = seat.etichetta + ' (' + seat.capienza + ' pers.) — ' + (isSelected ? 'selezionato' : seat.stato);
      circle.appendChild(title);

      if (seat.stato === 'disponibile' || isSelected) {
        circle.style.cursor = 'pointer';
        circle.addEventListener('click', function () { toggleSeat(seat.id); });
      }
      svg.appendChild(circle);

      var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('class', 'seat-label');
      label.setAttribute('x', seat.pos_x);
      label.setAttribute('y', seat.pos_y + 4);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '10');
      label.setAttribute('fill', isSelected ? '#fff' : seat.stato === 'occupato' ? '#555' : 'var(--neon-cyan)');
      label.setAttribute('pointer-events', 'none');
      label.textContent = seat.etichetta;
      svg.appendChild(label);
    });

    updateForm();
  }

  function toggleSeat(id) {
    var seat = seatData[id];
    if (!seat || seat.stato === 'occupato') return;

    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      if (selectedIds.size >= maxSeats) {
        alert('Puoi selezionare al massimo ' + maxSeats + ' posti.');
        return;
      }
      selectedIds.add(id);
    }
    render();
  }

  function updateForm() {
    selectedInput.value = Array.from(selectedIds).join(',');
    selectedCount.textContent = selectedIds.size;
    submitBtn.disabled = selectedIds.size === 0;
  }

  fetchAndRender();
})();
