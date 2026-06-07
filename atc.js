// aa-atc/js/atc.js
// Handles ATC comms, Claude API calls, transcript, flight load via paste box

const ANTHROPIC_KEY = 'YOUR_ANTHROPIC_KEY_HERE';

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

// ── Load flight from paste box ───────────────────────────────────────────────

function loadFlight() {
  const raw = document.getElementById('fp-input').value.trim();
  if (!raw) return;

  const lines = raw.split('\n');
  const l0 = lines[0] || '';
  const l1 = lines[1] || '';
  const l2 = lines[2] || '';
  const l3 = lines[3] || '';

  const csM   = l0.match(/^([A-Z0-9]+)\s*\|/);
  const acM   = l0.match(/\|\s*([^|]+?)\s*\|/);
  const rtM   = l0.match(/[→>]\s*(.+)$/);
  const sqM   = l1.match(/SQ:\s*(\d+)/);
  const czM   = l1.match(/CRZ:\s*([^|]+)/);
  const pxM   = l2.match(/PAX:\s*(\d+)/);
  const fuM   = l2.match(/Fuel:\s*([^|]+)/);
  const etdM  = l2.match(/ETD:\s*([^|]+)/);
  const pilM  = l3.match(/PIC:\s*(.+)$/);
  const evM   = raw.match(/Event seed:\s*(.+)/i);

  ATC.callsign    = csM  ? csM[1].trim()  : 'AAL000';
  ATC.aircraft    = acM  ? acM[1].trim()  : '—';
  ATC.route       = rtM  ? rtM[1].trim()  : '—';
  ATC.squawk      = sqM  ? sqM[1]         : '—';
  ATC.crz         = czM  ? czM[1].trim()  : '—';
  ATC.pax         = pxM  ? pxM[1]         : '—';
  ATC.fuel        = fuM  ? fuM[1].trim()  : '—';
  ATC.etd         = etdM ? etdM[1].trim() : '—';
  ATC.pilot       = pilM ? pilM[1].trim() : '—';
  ATC.eventSeed   = evM  ? evM[1].trim()  : 'None';
  ATC.flightLoaded = true;
  ATC.phase = 'Pre-departure';

  // Build system prompt with full flight context
  ATC.history = [
    {
      role: 'user',
      content: `You are a professional ATC controller for American Airlines Virtual, a Microsoft Flight Simulator virtual airline career mode. Respond ONLY as ATC using realistic FAA phraseology. Address the pilot by full spoken callsign (e.g. "American Twelve Twenty Two"). Keep transmissions concise and accurate. Confirm readbacks. Occasionally introduce realistic traffic calls or sequencing instructions for immersion. Never break character. Begin each response with the facility name followed by the callsign, e.g. "Fort Myers Ground, American Twelve Twenty Two,".

Active flight details:
${raw}

The pilot is at the gate, pre-departure. Stand by for contact.`
    }
  ];

  // Update sidebar
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

  addEntry('SYS', 'sys',
    `Flight ${ATC.callsign} loaded — ${ATC.aircraft} — ${ATC.route}`, 'sys');
}

// ── Transcript ───────────────────────────────────────────────────────────────

function zulu() {
  const n = new Date();
  return n.getUTCHours().toString().padStart(2, '0') +
         n.getUTCMinutes().toString().padStart(2, '0') + 'Z';
}

function addEntry(caller, callerClass, msg, msgClass) {
  const t = document.getElementById('transcript');
  const empty = t.querySelector('.empty-msg');
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
    `Flight phase: ${ATC.phase}. ` +
    `Event seed: ${ATC.eventSeed}. ` +
    `Pilot says: "${msg}"`;

  ATC.history.push({ role: 'user', content: context });

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
