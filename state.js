// aa-atc/js/state.js
// ATC state — no Supabase needed, flight loaded via paste box
 
let ATC = {
  callsign: '',
  aircraft: '',
  origin: '',
  destination: '',
  route: '',
  squawk: '',
  crz: '',
  pax: '',
  fuel: '',
  etd: '',
  pilot: '',
  eventSeed: 'None',
  flightLoaded: false,
  freq: '',
  facility: '',
  facilityLabel: '',
  phase: 'No flight',
  history: []
};
