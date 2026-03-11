import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hvhxdsukldgezqwtlwcc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2aHhkc3VrbGRnZXpxd3Rsd2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg0MjgwNTIsImV4cCI6MjA1NDAwNDA1Mn0.Z0R4yX7V95vXoA2tJZgxAoAmPwoe1xLSzA_7dnN02Xn'
);

// We assume the token is correct based on the typical sb_publishable format. Wait, the anon key in .env was not full JWT.
// Let me look at .env again... wait, I can just read the .env using node fs!

import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf-8');
const url = envFile.split('\n').find(l => l.startsWith('VITE_SUPABASE_URL'))?.split('=')[1];
const key = envFile.split('\n').find(l => l.startsWith('VITE_SUPABASE_ANON_KEY'))?.split('=')[1];

const client = createClient(url!, key!);

async function run() {
  console.log("Fetching pagos...");
  const { data, error } = await client.from('pagos').select('*');
  console.log("SELECT:", data, error);
  
  if (data) {
     console.log("TOTAL PAGOS:", data.length);
  }
}
run();
