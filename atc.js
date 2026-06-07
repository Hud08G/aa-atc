// aa-atc/js/atc.js
// Handles ATC comms, Claude API calls, transcript rendering

const ANTHROPIC_KEY = 'YOUR_ANTHROPIC_KEY_HERE'; // replace with your key

// ── Init ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  await initSupabase();
  const flight = await loadActiveFlight();

  if (flight) {
    populateFlight(flight);
  } else {
    document.getElementById('loading-msg').textContent =
      'No active flight found. Generate a dispatch in the ops hub first.';
    document.getElementById('hdr-flight').textContent = 'No active flight';
    document.getElementById('hdr-status').textContent = 'Waiting';
  }
});

// ── Populate flight data from Supabase row ───────────────────────────────────

function populateFlight(data) {
  ATC.callsign    = data.callsign    || 'AAL000';
  ATC.aircraft    = data.aircraft    || '—';
  ATC.origin      = data.origin      || '—';
  ATC.destination = data.destination || '—';
  ATC.route       = `${data.origin} → ${data.destination}`;
  ATC.squawk      = data.squawk      || '—';
  ATC.crz         = data.crz         || '—';
  ATC.pax         = data.pax         || '—';
  ATC.fuel        = data.fuel        || '—';
  ATC.etd         = data.etd         || '—';
  ATC.pilot       = data.pilot       || '—';
  ATC.eventSeed   = data.event_seed  || 'None';
  ATC.flightLoaded = true;
  ATC.phase = 'Pre-departure';

  // Seed the system prompt with full flight context
  ATC.history = [
    {
      role: 'user',
      content: `You are a professional ATC controller for American Airlines Virtual, a Microsoft Flight Simulator virtual airline career mode. Respond ONLY as ATC using realistic FAA phraseology. Address the pilot by full callsign (e.g. "American Twelve Twenty Two"). Keep transmissions concise. Confirm readbacks. Occasionally add realistic traffic calls or minor sequencing instructions. Never break character. Start each response with the facility name, e.g. "Fort Myers Ground, American Twelve Twenty Two,".

Active flight: ${ATC.callsign} | ${ATC.aircraft} | ${ATC.origin} → ${ATC.destination}
Route: ${data.route || '—'}
Squawk: ${ATC.squawk} | CRZ: ${ATC.crz}
PAX: ${ATC.pax} | Fuel: ${ATC.fuel} | ETD: ${ATC.etd}
Pilot in command: ${ATC.pilot}
Event seed: ${ATC.eventSeed}

The pilot is at the gate pre-departure. Stand by for contact.`
    }
  ];

  // Update UI
  document.getElementById('fp-cs').textContent    = ATC.callsign;
  document.getElementById('fp-ac').textContent    = ATC.aircraft;
  document.getElementById('fp-rt').textContent    = ATC.route;
  document.getElementById('fp-sq').textContent    = ATC.squawk;
  document.getElementById('fp-cz').textContent    = ATC.crz;
  document.getElementById('fp-px').textContent    = ATC.pax + ' pax';
  document.getElementById('fp-fu').textContent    = ATC.fuel;
  document.getElementById('fp-etd').textContent   = ATC.etd;
  document.getElementById('fp-pilot').textContent = ATC.pilot;
  document.getElementById('fp-event').textContent = ATC.eventSeed;
  document.getElementById('phase-txt').textContent = ATC.phase;
  document.getElementById('hdr-flight').textContent =
    `${ATC.callsign} | ${ATC.aircraft} | ${ATC.route}`;
  document.getElementById('hdr-status').textContent = 'Flight loaded';

  const loadingEl = document.getElementById('loading-msg');
  if (loadingEl) loadingEl.remove();

  addEntry('SYS', 'sys',
    `Flight ${ATC.callsign} loaded — ${ATC.aircraft} — ${ATC.route}`, 'sys');
}

// ── Frequency selector ───────────────────────────────────────────────────────

function setFreq(fac, freq, label, btn) {
  ATC.freq = freq;
  ATC.facility = fac;
  ATC.facilityLabel = label;
  document.querySelectorAll('.freq-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('freq-display').textContent = freq;
  addEntry('SYS', 'sys', `Tuned ${label} — ${freq}`, 'sys');
}

// ── Transcript ───────────────────────────────────────────────────────────────

function zulu() {
  const n = new Date();
  return n.getUTCHours().toString().padStart(2, '0') +
         n.getUTCMinutes().toString().padStart(2, '0') + 'Z';
}

function addEntry(caller, callerClass, msg, msgClass) {
  const t = document.getElementById('transcript');
  const empty = t.querySelector('.empty-msg, .loading-msg');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = 'tx-entry new';
  div.innerHTML =
    `<span class="tx-time">${zulu()}</span>` +
    `<span class="tx-caller ${callerClass}">${caller}</span>` +
    `<span class="tx-msg ${msgClass}">${msg}</span>`;
  t.appendChild(div);
  t.scrollTop = t.scrollHeight;
}

// ── Quick send ───────────────────────────────────────────────────────────────

function quickSend(msg) {
  document.getElementById('pilot-input').value = msg;
  transmit();
}

// ── Transmit ─────────────────────────────────────────────────────────────────

async function transmit() {
  const input = document.getElementById('pilot-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  const cs = ATC.callsign || 'PILOT';
  const facLabel = ATC.facilityLabel || 'RADIO';

  addEntry(cs, 'pilot', msg, 'pilot');

  const context =
    `Active facility: ${facLabel} (${ATC.freq || 'no freq'}). ` +
    `Phase: ${ATC.phase}. ` +
    `Event seed: ${ATC.eventSeed}. ` +
    `Pilot: "${msg}"`;

  ATC.history.push({ role: 'user', content: context });

  // Thinking indicator
  const t = document.getElementById('transcript');
  const thinkDiv = document.createElement('div');
  thinkDiv.className = 'tx-entry';
  thinkDiv.innerHTML =
    `<span class="tx-time">${zulu()}</span>` +
    `<span class="tx-caller atc">${facLabel}</span>` +
    `<span class="tx-msg atc" style="opacity:0.35">...</span>`;
  t.appendChild(thinkDiv);
  t.scrollTop = t.scrollHeight;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-allow-browser': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages: ATC.history
      })
    });

    const data = await res.json();
    const reply = data.content?.find(b => b.type === 'text')?.text || 'Say again?';

    thinkDiv.querySelector('.tx-msg').textContent = reply;
    thinkDiv.querySelector('.tx-msg').style.opacity = '1';
    ATC.history.push({ role: 'assistant', content: reply });
    updatePhase(msg, reply);

  } catch (e) {
    thinkDiv.querySelector('.tx-msg').textContent = '[Comms failure — check connection]';
  }
}

// ── Phase tracker ─────────────────────────────────────────────────────────────

function updatePhase(p, a) {
  const m = (p + a).toLowerCase();
  if (m.includes('pushback') || m.includes('taxi'))
    ATC.phase = 'Taxi';
  else if (m.includes('line up') || m.includes('cleared for takeoff') || m.includes('ready for departure'))
    ATC.phase = 'Departure';
  else if (m.includes('contact departure') || m.includes('frequency change'))
    ATC.phase = 'Climb';
  else if (m.includes('cruise') || m.includes('contact center') || m.includes('flight level'))
    ATC.phase = 'Cruise';
  else if (m.includes('descend') || m.includes('descent') || m.includes('contact approach'))
    ATC.phase = 'Descent';
  else if (m.includes('cleared') || m.includes('ils') || m.includes('localizer'))
    ATC.phase = 'Approach';
  else if (m.includes('vacated') || m.includes('clear of runway') || m.includes('taxi to gate'))
    ATC.phase = 'Landed';

  document.getElementById('phase-txt').textContent = ATC.phase;
}
