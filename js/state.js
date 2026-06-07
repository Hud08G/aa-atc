// aa-atc/js/state.js
// Connects to same Supabase project as aal-virtual, reads active flight

const SUPABASE_URL = 'https://docbvjmjossefcqgpvso.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvY2J2am1qb3NzZWZjcWdwdnNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzMjkzNDYsImV4cCI6MjA2MTkwNTM0Nn0.hX1GYxZnUoBGaY3ouh2M05m_4sWjvzjcOUMZN7sKFZc';

let sb;

async function initSupabase() {
  const { createClient } = supabase;
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ATC state
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

async function loadActiveFlight() {
  try {
    // Pull the most recent active dispatch from Supabase
    const { data, error } = await sb
      .from('dispatch')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      // No active flight — try most recent dispatched flight
      const { data: recent } = await sb
        .from('dispatch')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return recent || null;
    }
    return data;
  } catch (e) {
    console.error('Failed to load active flight:', e);
    return null;
  }
}
